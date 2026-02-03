/**
 * Server Manager Service
 * Manages the lifecycle of the keyword server (mcp-api-server.js) on-demand
 * 
 * This service runs on port 3002 and provides endpoints to:
 * - Check if the keyword server is running
 * - Start the keyword server on-demand
 * - Stop the keyword server
 * 
 * To run:
 * node server/server-manager.js
 */

const express = require('express');
const cors = require('cors');
const { spawn, exec } = require('child_process');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const { promisify } = require('util');
const execAsync = promisify(exec);

const app = express();
app.use(cors());
app.use(express.json());

const KEYWORD_SERVER_PORT = 3001;
const KEYWORD_SERVER_URL = `http://localhost:${KEYWORD_SERVER_PORT}`;
const KEYWORD_SERVER_PATH = path.join(__dirname, 'server.js');
const SERVER_MANAGER_PORT = 3002;

// Helper function to ensure debug log directory exists
function ensureDebugLogDir(logPath) {
  try {
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  } catch (e) {
    // Silently fail if directory creation fails
  }
}

// Track the keyword server process
let keywordServerProcess = null;
let serverStartTime = null;

/**
 * Check if the keyword server is running by calling its health endpoint
 */
async function checkKeywordServerHealth() {
  try {
    const response = await axios.get(`${KEYWORD_SERVER_URL}/api/mcp/health`, {
      timeout: 2000
    });
    return response.status === 200 && response.data.status === 'ok';
  } catch (error) {
    return false;
  }
}

/**
 * Check if PM2 is managing the server
 * Returns object with { isManaged: boolean, status: 'online' | 'stopped' | 'none' }
 */
async function checkPM2Status() {
  try {
    // Check if PM2 is installed and if mcp-api-server is managed by PM2
    // Use cross-platform approach - Windows PowerShell or Unix shell
    const isWindows = process.platform === 'win32';
    const command = isWindows 
      ? 'pm2 list'
      : 'pm2 list';
    
    const { stdout, stderr } = await execAsync(command, {
      windowsHide: true,
      maxBuffer: 1024 * 1024 // 1MB buffer for PM2 output
    });
    
    // Parse PM2 list output to find mcp-api-server
    // PM2 output format: process name appears in the list
    const lines = stdout.split('\n');
    let foundProcess = false;
    let isOnline = false;
    let isStopped = false;
    
    for (const line of lines) {
      if (line.includes('mcp-api-server')) {
        foundProcess = true;
        // Check status indicators in PM2 output
        if (line.includes('online') || line.includes('│ online')) {
          isOnline = true;
        } else if (line.includes('stopped') || line.includes('│ stopped')) {
          isStopped = true;
        }
        break;
      }
    }
    
    if (!foundProcess) {
      return { isManaged: false, status: 'none' };
    }
    
    if (isOnline) {
      return { isManaged: true, status: 'online' };
    } else if (isStopped) {
      return { isManaged: true, status: 'stopped' };
    }
    
    // If found but status unclear, check health endpoint as fallback
    const isRunning = await checkKeywordServerHealth();
    return { 
      isManaged: true, 
      status: isRunning ? 'online' : 'stopped' 
    };
  } catch (error) {
    // PM2 not available or error - assume not managed
    return { isManaged: false, status: 'none' };
  }
}

/**
 * Start the keyword server
 */
async function startKeywordServer() {
  // Check if server is already running
  const isRunning = await checkKeywordServerHealth();
  if (isRunning) {
    return { success: true, message: 'Server is already running', alreadyRunning: true };
  }

  // Check if server file exists
  if (!fs.existsSync(KEYWORD_SERVER_PATH)) {
    return { success: false, message: `Server file not found: ${KEYWORD_SERVER_PATH}` };
  }

  // Check PM2 status first
  const pm2Status = await checkPM2Status();
  
  if (pm2Status.isManaged) {
    if (pm2Status.status === 'stopped') {
      // PM2 process exists but is stopped - restart it
      try {
        console.log('[Server Manager] Restarting PM2-managed server...');
        const { stdout, stderr } = await execAsync('pm2 restart mcp-api-server', {
          cwd: path.dirname(KEYWORD_SERVER_PATH)
        });
        console.log('[Server Manager] PM2 restart output:', stdout);
        
        // Wait for server to be ready
        const maxWaitTime = 30000;
        const pollInterval = 500;
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
          const isReady = await checkKeywordServerHealth();
          if (isReady) {
            return {
              success: true,
              message: 'Server restarted via PM2',
              startupTime: Date.now() - startTime,
              method: 'pm2'
            };
          }
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
        
        return { success: false, message: 'PM2 server did not start within timeout' };
      } catch (error) {
        console.error('[Server Manager] Error restarting PM2 server:', error.message);
        // Fall through to direct spawn
      }
    } else if (pm2Status.status === 'online') {
      // Shouldn't happen since we checked health, but handle it
      const isReady = await checkKeywordServerHealth();
      if (isReady) {
        return { success: true, message: 'Server is already running via PM2', alreadyRunning: true };
      }
    }
  }

  // If there's a stale process reference, clear it
  if (keywordServerProcess && keywordServerProcess.killed === false) {
    try {
      keywordServerProcess.kill();
    } catch (error) {
      console.warn('[Server Manager] Error killing stale process:', error.message);
    }
  }

  // Use direct spawn method
  return new Promise((resolve) => {
    console.log('[Server Manager] Starting keyword server via direct spawn...');
    // #region agent log
    const logPath = path.join(__dirname, '..', '.cursor', 'debug.log');
    const logEntry = {sessionId:'debug-session',runId:'run1',location:'server-manager.js:180',message:'Spawning keyword server process',data:{serverPath:KEYWORD_SERVER_PATH,port:KEYWORD_SERVER_PORT,pid:process.pid},timestamp:Date.now(),hypothesisId:'C'};
    try{ensureDebugLogDir(logPath);fs.appendFileSync(logPath,JSON.stringify(logEntry)+'\n');}catch(e){}
    // #endregion
    
    // Spawn the server process
    keywordServerProcess = spawn('node', [KEYWORD_SERVER_PATH], {
      cwd: path.dirname(KEYWORD_SERVER_PATH),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false
    });
    // #region agent log
    const logEntry2 = {sessionId:'debug-session',runId:'run1',location:'server-manager.js:188',message:'Keyword server process spawned',data:{spawnedPid:keywordServerProcess.pid,parentPid:process.pid},timestamp:Date.now(),hypothesisId:'C'};
    try{ensureDebugLogDir(logPath);fs.appendFileSync(logPath,JSON.stringify(logEntry2)+'\n');}catch(e){}
    // #endregion

    serverStartTime = Date.now();

    let stdoutData = '';
    let stderrData = '';

    keywordServerProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdoutData += output;
      console.log('[Keyword Server]', output.trim());
    });

    keywordServerProcess.stderr.on('data', (data) => {
      const output = data.toString();
      stderrData += output;
      // #region agent log
      if(output.includes('EADDRINUSE')||output.includes('address already in use')){
        const logPath = path.join(__dirname, '..', '.cursor', 'debug.log');
        const logEntry = {sessionId:'debug-session',runId:'run1',location:'server-manager.js:202',message:'Detected EADDRINUSE in stderr',data:{stderr:output.trim(),parentPid:process.pid},timestamp:Date.now(),hypothesisId:'A'};
        try{ensureDebugLogDir(logPath);fs.appendFileSync(logPath,JSON.stringify(logEntry)+'\n');}catch(e){}
      }
      // #endregion
      console.error('[Keyword Server Error]', output.trim());
    });

    keywordServerProcess.on('error', (error) => {
      // #region agent log
      const logPath = path.join(__dirname, '..', '.cursor', 'debug.log');
      const logEntry = {sessionId:'debug-session',runId:'run1',location:'server-manager.js:207',message:'Keyword server spawn error',data:{error:error.message,code:error.code,parentPid:process.pid},timestamp:Date.now(),hypothesisId:'C'};
      try{ensureDebugLogDir(logPath);fs.appendFileSync(logPath,JSON.stringify(logEntry)+'\n');}catch(e){}
      // #endregion
      console.error('[Server Manager] Failed to start server:', error);
      keywordServerProcess = null;
      resolve({
        success: false,
        message: `Failed to start server: ${error.message}`
      });
    });

    keywordServerProcess.on('exit', (code, signal) => {
      console.log(`[Server Manager] Server process exited with code ${code}, signal ${signal}`);
      keywordServerProcess = null;
      serverStartTime = null;
    });

    // Wait for server to be ready (poll health endpoint)
    const maxWaitTime = 30000; // 30 seconds
    const pollInterval = 500; // Check every 500ms
    const startTime = Date.now();

    const pollHealth = setInterval(async () => {
      const isReady = await checkKeywordServerHealth();
      const elapsed = Date.now() - startTime;

      if (isReady) {
        clearInterval(pollHealth);
        console.log('[Server Manager] Server is ready!');
        resolve({
          success: true,
          message: 'Server started successfully',
          pid: keywordServerProcess?.pid,
          startupTime: elapsed,
          method: 'spawn'
        });
      } else if (elapsed >= maxWaitTime) {
        clearInterval(pollHealth);
        console.error('[Server Manager] Server failed to start within timeout');
        if (keywordServerProcess) {
          keywordServerProcess.kill();
          keywordServerProcess = null;
        }
        resolve({
          success: false,
          message: 'Server failed to start within 30 seconds',
          stderr: stderrData
        });
      } else if (keywordServerProcess && keywordServerProcess.killed) {
        clearInterval(pollHealth);
        resolve({
          success: false,
          message: 'Server process was killed',
          stderr: stderrData
        });
      }
    }, pollInterval);
  });
}

/**
 * Stop the keyword server
 */
async function stopKeywordServer() {
  // Check PM2 status first
  const pm2Status = await checkPM2Status();
  
  if (pm2Status.isManaged && pm2Status.status === 'online') {
    try {
      console.log('[Server Manager] Stopping PM2-managed server...');
      const { stdout, stderr } = await execAsync('pm2 stop mcp-api-server', {
        cwd: path.dirname(KEYWORD_SERVER_PATH)
      });
      console.log('[Server Manager] PM2 stop output:', stdout);
      
      // Wait a bit and verify it's stopped
      await new Promise(resolve => setTimeout(resolve, 2000));
      const isStillRunning = await checkKeywordServerHealth();
      
      if (isStillRunning) {
        return { success: false, message: 'PM2 server did not stop gracefully' };
      }
      
      return { success: true, message: 'Server stopped successfully via PM2', method: 'pm2' };
    } catch (error) {
      console.error('[Server Manager] Error stopping PM2 server:', error.message);
      // Fall through to direct process kill
    }
  }

  // Try direct process kill if we have a reference
  if (keywordServerProcess) {
    try {
      keywordServerProcess.kill('SIGTERM');
      keywordServerProcess = null;
      serverStartTime = null;
      
      // Wait a bit and verify it's stopped
      await new Promise(resolve => setTimeout(resolve, 1000));
      const isStillRunning = await checkKeywordServerHealth();
      
      if (isStillRunning) {
        return { success: false, message: 'Server did not stop gracefully' };
      }
      
      return { success: true, message: 'Server stopped successfully', method: 'spawn' };
    } catch (error) {
      return { success: false, message: `Error stopping server: ${error.message}` };
    }
  }

  // Check if server is still running (could be external process)
  const isRunning = await checkKeywordServerHealth();
  if (!isRunning) {
    return { success: true, message: 'Server is not running' };
  }
  
  // Server is running but we don't have control - try PM2 stop anyway
  try {
    await execAsync('pm2 stop mcp-api-server', { cwd: path.dirname(KEYWORD_SERVER_PATH) });
    await new Promise(resolve => setTimeout(resolve, 2000));
    const isStillRunning = await checkKeywordServerHealth();
    if (!isStillRunning) {
      return { success: true, message: 'Server stopped via PM2 command', method: 'pm2' };
    }
  } catch (error) {
    // PM2 command failed, server may not be PM2-managed
  }
  
  return { success: false, message: 'Server is running but could not be stopped (may need manual stop)' };
}

/**
 * Get status of the keyword server
 */
async function getKeywordServerStatus() {
  const isRunning = await checkKeywordServerHealth();
  const hasProcess = keywordServerProcess !== null && !keywordServerProcess.killed;
  const uptime = serverStartTime ? Date.now() - serverStartTime : null;

  return {
    running: isRunning,
    hasProcess,
    pid: hasProcess ? keywordServerProcess.pid : null,
    uptime: uptime ? Math.floor(uptime / 1000) : null, // uptime in seconds
    port: KEYWORD_SERVER_PORT,
    url: KEYWORD_SERVER_URL
  };
}

// API Endpoints

/**
 * Health check for server manager itself
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Server manager is running',
    port: SERVER_MANAGER_PORT,
    keywordServerPort: KEYWORD_SERVER_PORT
  });
});

/**
 * Get status of keyword server
 */
app.get('/status', async (req, res) => {
  try {
    const status = await getKeywordServerStatus();
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Start the keyword server
 */
app.post('/start', async (req, res) => {
  try {
    const result = await startKeywordServer();
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Stop the keyword server
 */
app.post('/stop', async (req, res) => {
  try {
    const result = await stopKeywordServer();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Start the server manager
// #region agent log
const logPath = path.join(__dirname, '..', '.cursor', 'debug.log');
const logEntry = {sessionId:'debug-session',runId:'run1',location:'server-manager.js:422',message:'Attempting to start server manager',data:{port:SERVER_MANAGER_PORT,keywordServerPort:KEYWORD_SERVER_PORT,pid:process.pid},timestamp:Date.now(),hypothesisId:'B'};
try{ensureDebugLogDir(logPath);fs.appendFileSync(logPath,JSON.stringify(logEntry)+'\n');}catch(e){}
// #endregion
const managerServer = app.listen(SERVER_MANAGER_PORT, () => {
  // #region agent log
  const logEntry2 = {sessionId:'debug-session',runId:'run1',location:'server-manager.js:423',message:'Server manager successfully started',data:{port:SERVER_MANAGER_PORT,pid:process.pid},timestamp:Date.now(),hypothesisId:'B'};
  try{ensureDebugLogDir(logPath);fs.appendFileSync(logPath,JSON.stringify(logEntry2)+'\n');}catch(e){}
  // #endregion
  console.log(`\n✅ Server Manager running on http://localhost:${SERVER_MANAGER_PORT}`);
  console.log(`📊 Managing keyword server on port ${KEYWORD_SERVER_PORT}`);
  console.log(`\n🔗 Available endpoints:`);
  console.log(`   GET  /health - Server manager health check`);
  console.log(`   GET  /status - Check keyword server status`);
  console.log(`   POST /start  - Start keyword server`);
  console.log(`   POST /stop   - Stop keyword server\n`);
});
// #region agent log
managerServer.on('error',(err)=>{
  const logEntry3 = {sessionId:'debug-session',runId:'run1',location:'server-manager.js:error',message:'Server manager listen error',data:{port:SERVER_MANAGER_PORT,error:err.message,code:err.code,errno:err.errno,pid:process.pid},timestamp:Date.now(),hypothesisId:'B'};
  try{ensureDebugLogDir(logPath);fs.appendFileSync(logPath,JSON.stringify(logEntry3)+'\n');}catch(e){}
  if(err.code === 'EADDRINUSE'){
    console.error(`\n❌ ERROR: Port ${SERVER_MANAGER_PORT} is already in use!`);
    console.error(`   Please stop the process using port ${SERVER_MANAGER_PORT} or change the SERVER_MANAGER_PORT.`);
    console.error(`   To find what's using the port: netstat -ano | findstr :${SERVER_MANAGER_PORT}`);
    process.exit(1);
  }else{
    console.error(`\n❌ ERROR: Failed to start server manager:`, err.message);
    process.exit(1);
  }
});
// #endregion

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n[Server Manager] Received SIGTERM, shutting down gracefully...');
  if (keywordServerProcess) {
    await stopKeywordServer();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n[Server Manager] Received SIGINT, shutting down gracefully...');
  if (keywordServerProcess) {
    await stopKeywordServer();
  }
  process.exit(0);
});


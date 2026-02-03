/**
 * PM2 Ecosystem Configuration
 * This keeps the backend server running in the background
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 stop mcp-api-server
 *   pm2 restart mcp-api-server
 *   pm2 logs mcp-api-server
 *   pm2 delete mcp-api-server
 */

module.exports = {
  apps: [{
    name: 'mcp-api-server',
    script: 'server.js',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};


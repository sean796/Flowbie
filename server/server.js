/**
 * Express.js server to call DataForSEO API directly
 * This server calls DataForSEO REST API and returns results to the frontend
 * 
 * To run:
 * 1. npm install express cors axios
 * 2. node server/server.js
 * 3. The server will run on http://localhost:3001
 */

const express = require('express');
const cors = require('cors');
const { DATAFORSEO_CREDENTIALS } = require('./config');
const dataForSEORoutes = require('./dataforseo-routes');
const wordPressRoutes = require('./wordpress-routes');
const gscRoutes = require('./gsc-routes');
const knowledgeModelRoutes = require('./knowledge-model-routes');
const googleMapsImageRoutes = require('./google-maps-image-routes');
const companyScraperRoutes = require('./company-scraper-routes');
const wpEngineRoutes = require('./wpengine-routes');
const deathStarRoutes = require('./death-star-routes');

// Step 2: Router Load Verification
console.log('[Server] WordPress router type:', typeof wordPressRoutes);
console.log('[Server] WordPress router is function:', typeof wordPressRoutes === 'function');

const app = express();

app.use(cors());
// Increase body parser limit to handle large WordPress post content (default is 100kb)
// WordPress posts with HTML content can easily exceed 100kb
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Root route - API info (avoids "Cannot GET /" when visiting base URL)
app.get('/', (req, res) => {
  res.json({
    name: 'Flowbie API',
    status: 'running',
    health: '/api/mcp/health',
    endpoints: {
      mcp: '/api/mcp/*',
      wordpress: '/api/wordpress/*',
      gsc: '/api/gsc/*',
      knowledgeModel: '/api/knowledge-model/*',
      wpengine: '/api/wpengine/*'
    }
  });
});

// Register routes
app.use(dataForSEORoutes);

// Request logging middleware for WordPress routes (before router)
app.use('/api/wordpress', (req, res, next) => {
  console.log(`[WordPress Route] ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Mount WordPress router at /api/wordpress prefix
app.use('/api/wordpress', wordPressRoutes);

// Mount GSC router at /api/gsc prefix
app.use('/api/gsc', gscRoutes);

// Mount Knowledge Model router at /api/knowledge-model prefix
app.use('/api/knowledge-model', knowledgeModelRoutes);

// Mount Google Maps Image router at /api/google-maps-image prefix
app.use('/api/google-maps-image', googleMapsImageRoutes);

// Mount Company Scraper router (routes include /api/company prefix)
app.use(companyScraperRoutes);

// Mount WP Engine router at /api/wpengine prefix
app.use('/api/wpengine', wpEngineRoutes);
console.log('[Server] WP Engine router mounted successfully at /api/wpengine');

// Mount Death Star router at /api/death-star prefix (internal link QC)
app.use('/api/death-star', deathStarRoutes);
console.log('[Server] Death Star router mounted successfully at /api/death-star');

// Step 2: Router Mount Verification
if (wordPressRoutes && typeof wordPressRoutes === 'function') {
  console.log('[Server] WordPress router mounted successfully at /api/wordpress');
} else {
  console.error('[Server] ERROR: WordPress router is not a function!');
}

// Step 1: Direct Test Route (Temporary Diagnostic)
app.post('/api/wordpress/get-published-posts', (req, res) => {
  console.log('[DEBUG] Direct route hit!');
  res.json({ debug: true, message: 'Direct route works', timestamp: new Date().toISOString() });
});

// Function to log all registered routes
function logRegisteredRoutes() {
  console.log('\n📋 Checking registered routes...');
  
  // Verify WordPress router is loaded
  if (wordPressRoutes && typeof wordPressRoutes === 'function') {
    console.log('✅ WordPress router loaded successfully');
  } else {
    console.log('❌ ERROR: WordPress router not loaded properly!');
  }
  
  // Simple check for WordPress routes in the stack
  let foundWordPressRoutes = false;
  app._router.stack.forEach((layer, layerIdx) => {
    if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      // Check if this router is mounted at /api/wordpress
      // Check the regexp source (pattern without delimiters) to see if it contains both 'wordpress' and 'api'
      // This avoids false positives from root routers that match any path
      const regexpSource = layer.regexp ? layer.regexp.source : '';
      const includesWordPress = regexpSource.includes('wordpress') && regexpSource.includes('api');
      const testMatches = layer.regexp && layer.regexp.test('/api/wordpress');
      const isWordPressRouter = layer.regexp && includesWordPress && testMatches;
      
      // Recursively find all routes in nested routers
      function logWordPressRoutes(routerStack, basePath = '/api/wordpress') {
        if (!routerStack) return;
        routerStack.forEach((sublayer) => {
          if (sublayer.route) {
            // Direct route
            foundWordPressRoutes = true;
            const methods = Object.keys(sublayer.route.methods).map(m => m.toUpperCase()).join(', ');
            console.log(`   ${methods.padEnd(7)} ${basePath}${sublayer.route.path}`);
          } else if (sublayer.name === 'router' && sublayer.handle && sublayer.handle.stack) {
            // Nested router - recurse into it
            logWordPressRoutes(sublayer.handle.stack, basePath);
          }
        });
      }
      logWordPressRoutes(layer.handle.stack);
    }
  });
  
  // Step 3: Route Registration Verification
  const requiredRoutes = [
    '/api/wordpress/get-published-posts',
    '/api/wordpress/get-post-content'
  ];
  
  console.log('\n🔍 Checking required WordPress routes:');
  requiredRoutes.forEach(requiredPath => {
    // Check both direct routes and router-mounted routes
    let found = false;
    let foundAsDirect = false;
    let foundAsRouter = false;
    
    app._router.stack.forEach(layer => {
      // Check direct routes (like our test route)
      if (layer.route && layer.route.path === requiredPath) {
        const methods = Object.keys(layer.route.methods);
        if (methods.includes('post')) {
          found = true;
          foundAsDirect = true;
        }
      } 
      // Check router-mounted routes
      else if (layer.name === 'router' && layer.regexp && layer.regexp.test('/api/wordpress')) {
        // Recursively check nested routers for routes
        function checkNestedRoutes(routerStack, basePath) {
          if (!routerStack) return;
          routerStack.forEach(sublayer => {
            if (sublayer.route) {
              // Found a direct route
              const routerPath = sublayer.route.path;
              const fullPath = basePath + routerPath;
              if (fullPath === requiredPath) {
                const methods = Object.keys(sublayer.route.methods);
                if (methods.includes('post')) {
                  found = true;
                  foundAsRouter = true;
                }
              }
            } else if (sublayer.name === 'router' && sublayer.handle && sublayer.handle.stack) {
              // This is a nested router - recurse into it (basePath stays the same for WordPress routes)
              checkNestedRoutes(sublayer.handle.stack, basePath);
            }
          });
        }
        if (layer.handle && layer.handle.stack) {
          checkNestedRoutes(layer.handle.stack, '/api/wordpress');
        }
      }
    });
    
    if (found) {
      const source = foundAsDirect ? ' (direct route)' : foundAsRouter ? ' (router)' : '';
      console.log(`   ✅ ${requiredPath}${source}`);
    } else {
      console.log(`   ❌ MISSING: ${requiredPath}`);
    }
  });
  
  if (!foundWordPressRoutes) {
    console.log('⚠️  WARNING: No WordPress routes found in router stack!');
    console.log('   This may indicate a route registration issue.');
  }
  
  console.log('   (Use GET /api/debug/routes for detailed route inspection)\n');
}

/**
 * Route inspection endpoint for debugging
 */
app.get('/api/debug/routes', (req, res) => {
  const routes = [];
  
  function extractRoutes(layer, path = '') {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase()).join(', ');
      routes.push({
        method: methods,
        path: path + layer.route.path
      });
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      const routerPath = path;
      layer.handle.stack.forEach(sublayer => {
        extractRoutes(sublayer, routerPath);
      });
    }
  }
  
  app._router.stack.forEach(layer => {
    extractRoutes(layer);
  });
  
  const wordpressRoutes = routes.filter(r => r.path.includes('/api/wordpress'));
  
  res.json({
    totalRoutes: routes.length,
    wordpressRoutes: wordpressRoutes,
    allRoutes: routes
  });
});

/**
 * Health check endpoint
 */
app.get('/api/mcp/health', (req, res) => {
  // Verify credentials are set
  const credentialsConfigured = !!(DATAFORSEO_CREDENTIALS.api_login && DATAFORSEO_CREDENTIALS.api_password);
  
  // Verify auth encoding is correct (no spaces)
  const authTest = Buffer.from(`${DATAFORSEO_CREDENTIALS.api_login}:${DATAFORSEO_CREDENTIALS.api_password}`).toString('base64');
  const authValid = !authTest.includes(' ') && !authTest.includes('\n') && authTest.length > 0;
  
  res.json({ 
    status: 'ok', 
    message: 'MCP API server is running',
    credentials: {
      api_login: DATAFORSEO_CREDENTIALS.api_login,
      configured: credentialsConfigured,
      auth_encoding_valid: authValid
    },
    endpoints: {
      keyword_overview: '/api/mcp/DataForSEO_dataforseo_labs_google_keyword_overview',
      keyword_ideas: '/api/mcp/DataForSEO_dataforseo_labs_google_keyword_ideas',
      related_keywords: '/api/mcp/DataForSEO_dataforseo_labs_google_related_keywords',
      serp_organic: '/api/mcp/DataForSEO_serp_organic_live_advanced',
      on_page_content_parsing: '/api/mcp/DataForSEO_on_page_content_parsing',
      page_intersection: '/api/mcp/DataForSEO_dataforseo_labs_google_page_intersection',
      wordpress_test: '/api/wordpress/test-connection',
      wordpress_detect_sitemaps: '/api/wordpress/detect-sitemaps',
      wordpress_parse_sitemap: '/api/wordpress/parse-sitemap',
      gsc_fetch_queries: '/api/gsc/fetch-queries',
      gsc_test_connection: '/api/gsc/test-connection',
      gsc_check_indexing: '/api/gsc/check-url-indexing',
      gsc_request_indexing: '/api/gsc/request-url-indexing',
      gsc_index_sitemap: '/api/gsc/index-sitemap-urls',
      wpengine_test_connection: '/api/wpengine/test-connection'
    }
  });
});

const PORT = process.env.PORT || 3001;
// #region agent log
const fs = require('fs');
const path = require('path');
const logPath = path.join(__dirname, '..', '.cursor', 'debug.log');
function ensureDebugLogDir() {
  try {
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  } catch (e) {}
}
const logEntry = {sessionId:'debug-session',runId:'run1',location:'server.js:247',message:'Attempting to bind to port',data:{port:PORT,pid:process.pid},timestamp:Date.now(),hypothesisId:'A'};
try{ensureDebugLogDir();fs.appendFileSync(logPath,JSON.stringify(logEntry)+'\n');}catch(e){}
// #endregion
const server = app.listen(PORT, () => {
  // #region agent log
  const logEntry2 = {sessionId:'debug-session',runId:'run1',location:'server.js:249',message:'Server successfully bound to port',data:{port:PORT,pid:process.pid},timestamp:Date.now(),hypothesisId:'A'};
  try{ensureDebugLogDir();fs.appendFileSync(logPath,JSON.stringify(logEntry2)+'\n');}catch(e){}
  // #endregion
  console.log(`\n✅ MCP API server running on http://localhost:${PORT}`);
  console.log(`📊 DataForSEO credentials configured for: ${DATAFORSEO_CREDENTIALS.api_login}`);
  console.log(`\n🔗 Available endpoints:`);
  console.log(`   POST /api/mcp/DataForSEO_dataforseo_labs_google_keyword_overview`);
  console.log(`   POST /api/mcp/DataForSEO_dataforseo_labs_google_keyword_ideas`);
  console.log(`   POST /api/mcp/DataForSEO_dataforseo_labs_google_related_keywords`);
  console.log(`   POST /api/mcp/DataForSEO_serp_organic_live_advanced`);
  console.log(`   POST /api/mcp/DataForSEO_on_page_content_parsing`);
  console.log(`   POST /api/mcp/DataForSEO_dataforseo_labs_google_page_intersection`);
  console.log(`   POST /api/wordpress/test-connection`);
  console.log(`   POST /api/wordpress/detect-sitemaps`);
  console.log(`   POST /api/wordpress/parse-sitemap`);
  console.log(`   POST /api/gsc/fetch-queries`);
  console.log(`   GET  /api/gsc/test-connection`);
  console.log(`   POST /api/gsc/check-url-indexing`);
  console.log(`   POST /api/gsc/request-url-indexing`);
  console.log(`   POST /api/gsc/index-sitemap-urls`);
  console.log(`   POST /api/company/from-url`);
  console.log(`   POST /api/company/from-search`);
  console.log(`   GET  /api/mcp/health\n`);
  
  // Log all registered routes for debugging
  logRegisteredRoutes();
});
// #region agent log
server.on('error',(err)=>{
  const logEntry3 = {sessionId:'debug-session',runId:'run1',location:'server.js:error',message:'Server listen error',data:{port:PORT,error:err.message,code:err.code,errno:err.errno,pid:process.pid},timestamp:Date.now(),hypothesisId:'A'};
  try{fs.appendFileSync(logPath,JSON.stringify(logEntry3)+'\n');}catch(e){}
  if(err.code === 'EADDRINUSE'){
    console.error(`\n❌ ERROR: Port ${PORT} is already in use!`);
    console.error(`   Please stop the process using port ${PORT} or change the PORT environment variable.`);
    console.error(`   To find what's using the port: netstat -ano | findstr :${PORT}`);
    process.exit(1);
  }else{
    console.error(`\n❌ ERROR: Failed to start server:`, err.message);
    process.exit(1);
  }
});
// #endregion


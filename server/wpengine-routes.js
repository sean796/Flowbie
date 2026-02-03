/**
 * WP Engine API Routes
 * POST /test-connection - Test WP Engine API connection
 * POST /list-sites - List all installs
 * POST /clone-site - Clone a site
 * POST /set-domain - Set domain on install
 * POST /get-site-credentials - Get site credentials
 */

const express = require('express');
const axios = require('axios');
const { listSites, createSite, copySite, waitForProvisioning, getSiteCredentials } = require('./wp-engine/sites');
const { setDomain, verifyDomain } = require('./wp-engine/domains');

const router = express.Router();

/**
 * Test WP Engine API connection
 * POST /test-connection
 * 
 * Body: {
 *   apiUsername: string,
 *   apiPassword: string
 * }
 */
router.post('/test-connection', async (req, res) => {
  console.log('[WP Engine Routes] POST /test-connection - Request received');
  try {
    const { apiUsername, apiPassword } = req.body;
    
    if (!apiUsername || !apiPassword) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: apiUsername, apiPassword'
      });
    }
    
    // WP Engine API base URL
    const apiBaseUrl = 'https://api.wpengineapi.com/v1';
    
    // Test endpoint - get installs list (simple endpoint to test auth)
    const testUrl = `${apiBaseUrl}/installs?limit=1`;
    
    console.log(`[WP Engine] Testing connection to: ${testUrl}`);
    
    try {
      // Create Basic Auth header
      const auth = Buffer.from(`${apiUsername}:${apiPassword}`).toString('base64');
      
      const response = await axios.get(testUrl, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000,
        validateStatus: (status) => status < 500 // Accept 401, 404, etc. as valid responses
      });
      
      if (response.status === 200) {
        res.json({
          success: true,
          message: 'WP Engine API connection successful',
          status: response.status,
          data: response.data
        });
      } else if (response.status === 401) {
        res.json({
          success: false,
          message: 'Authentication failed. Please check your API username and password.',
          status: response.status
        });
      } else if (response.status === 403) {
        res.json({
          success: false,
          message: 'Access forbidden. Please check your API credentials and permissions.',
          status: response.status
        });
      } else {
        res.json({
          success: false,
          message: `WP Engine API returned status ${response.status}`,
          status: response.status
        });
      }
    } catch (error) {
      if (error.response) {
        if (error.response.status === 401) {
          res.json({
            success: false,
            message: 'Authentication failed. Please check your API username and password.',
            status: error.response.status
          });
        } else if (error.response.status === 403) {
          res.json({
            success: false,
            message: 'Access forbidden. Please check your API credentials and permissions.',
            status: error.response.status
          });
        } else if (error.response.status === 404) {
          res.json({
            success: false,
            message: 'WP Engine API endpoint not found.',
            status: error.response.status
          });
        } else {
          res.json({
            success: false,
            message: `WP Engine API error: ${error.response.status} ${error.response.statusText}`,
            status: error.response.status
          });
        }
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        res.json({
          success: false,
          message: 'Cannot reach WP Engine API. Please check your internet connection.',
          error: error.message
        });
      } else if (error.code === 'ETIMEDOUT') {
        res.json({
          success: false,
          message: 'Connection timeout. The WP Engine API may be slow or unreachable.',
          error: error.message
        });
      } else {
        res.json({
          success: false,
          message: `Connection error: ${error.message}`,
          error: error.message
        });
      }
    }
  } catch (error) {
    console.error('[WP Engine] Test connection error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * List all installs for an account
 * POST /list-sites
 * 
 * Body: {
 *   apiKey: string,
 *   apiSecret: string,
 *   limit?: number,
 *   offset?: number
 * }
 */
router.post('/list-sites', async (req, res) => {
  console.log('[WP Engine Routes] POST /list-sites - Request received');
  try {
    const { apiKey, apiSecret, limit, offset } = req.body;
    
    if (!apiKey || !apiSecret) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: apiKey, apiSecret'
      });
    }
    
    const result = await listSites(apiKey, apiSecret, { limit, offset });
    res.json(result);
  } catch (error) {
    console.error('[WP Engine Routes] List sites error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

/**
 * Clone a site (create new site and optionally copy content)
 * POST /clone-site
 * 
 * Body: {
 *   apiKey: string,
 *   apiSecret: string,
 *   sourceSiteId?: string|number,
 *   domain: string,
 *   siteName: string,
 *   environment?: string,
 *   templateSiteUrl?: string
 * }
 */
router.post('/clone-site', async (req, res) => {
  console.log('[WP Engine Routes] POST /clone-site - Request received');
  // #region agent log
  const fs = require('fs');
  const path = require('path');
  const logPath = path.join(__dirname, '..', '.cursor', 'debug.log');
  try { fs.appendFileSync(logPath, JSON.stringify({location:'wpengine-routes.js:190',message:'Request received',data:{hasApiKey:!!req.body.apiKey,hasApiSecret:!!req.body.apiSecret,sourceSiteId:req.body.sourceSiteId,domain:req.body.domain,siteName:req.body.siteName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})+'\n'); } catch(e) {}
  // #endregion
  try {
    const { apiKey, apiSecret, sourceSiteId, domain, siteName, environment, templateSiteUrl } = req.body;
    
    if (!apiKey || !apiSecret || !domain || !siteName) {
      // #region agent log
      try { fs.appendFileSync(logPath, JSON.stringify({location:'wpengine-routes.js:197',message:'Missing required fields',data:{hasApiKey:!!apiKey,hasApiSecret:!!apiSecret,hasDomain:!!domain,hasSiteName:!!siteName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})+'\n'); } catch(e) {}
      // #endregion
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: apiKey, apiSecret, domain, siteName'
      });
    }
    
    let newSite;
    let usedFallback = false; // Track if we fell back from copy to create
    
    // WP Engine API does not support copy/clone operations
    // Always create a new site directly - do NOT attempt to copy
    // #region agent log
    try { fs.appendFileSync(logPath, JSON.stringify({location:'wpengine-routes.js:205',message:'Creating new site directly (copy not supported)',data:{siteName,environment:environment||'production',sourceSiteId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})+'\n'); } catch(e) {}
    // #endregion
    
    console.log('[WP Engine Routes] Creating new site (WP Engine API does not support copy/clone operations)');
    usedFallback = true;
    
    // Create a new site directly - do NOT attempt copy
    const createResult = await createSite(apiKey, apiSecret, {
      name: siteName,
      environment: environment || 'production'
      // Explicitly NOT providing site_id - let WP Engine create a new site
    });
    
    // #region agent log
    try { fs.appendFileSync(logPath, JSON.stringify({location:'wpengine-routes.js:215',message:'After createSite call',data:{success:createResult.success,error:createResult.error,hasInstall:!!createResult.install},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})+'\n'); } catch(e) {}
    // #endregion
    
    if (!createResult.success) {
      return res.json({
        success: false,
        error: createResult.error || 'Failed to create site',
        newSiteUrl: null,
        newSiteCredentials: null
      });
    }
    
    newSite = createResult.install;
    
    const installId = newSite.id || newSite.install_id;
    
    // Wait for provisioning
    const provisioningResult = await waitForProvisioning(apiKey, apiSecret, installId, {
      maxWaitTime: 300000, // 5 minutes
      pollInterval: 5000
    });
    
    if (!provisioningResult.success) {
      return res.json({
        success: false,
        error: provisioningResult.error || 'Site provisioning failed or timed out',
        newSiteUrl: null,
        newSiteCredentials: null
      });
    }
    
    // Set domain
    const domainResult = await setDomain(apiKey, apiSecret, installId, domain);
    
    if (!domainResult.success) {
      console.warn('[WP Engine Routes] Failed to set domain:', domainResult.error);
      // Continue even if domain setting fails
    }
    
    // Get credentials
    const credentialsResult = await getSiteCredentials(apiKey, apiSecret, installId);
    
    res.json({
      success: true,
      newSiteUrl: credentialsResult.credentials?.siteUrl || newSite.url || `https://${siteName}.wpengine.com`,
      newSiteCredentials: credentialsResult.credentials || null,
      installId,
      templateSiteUrl: templateSiteUrl || null,
      warning: usedFallback ? 'Note: WP Engine API does not support copying/cloning sites. A new site was created instead. You may need to manually copy content from the template site.' : null
    });
  } catch (error) {
    console.error('[WP Engine Routes] Clone site error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      newSiteUrl: null,
      newSiteCredentials: null
    });
  }
});

/**
 * Set domain on an install
 * POST /set-domain
 * 
 * Body: {
 *   apiKey: string,
 *   apiSecret: string,
 *   installId: string|number,
 *   domain: string
 * }
 */
router.post('/set-domain', async (req, res) => {
  console.log('[WP Engine Routes] POST /set-domain - Request received');
  try {
    const { apiKey, apiSecret, installId, domain } = req.body;
    
    if (!apiKey || !apiSecret || !installId || !domain) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: apiKey, apiSecret, installId, domain'
      });
    }
    
    const result = await setDomain(apiKey, apiSecret, installId, domain);
    
    if (result.success) {
      // Verify domain assignment
      const verifyResult = await verifyDomain(apiKey, apiSecret, installId, domain);
      result.verified = verifyResult.verified;
    }
    
    res.json(result);
  } catch (error) {
    console.error('[WP Engine Routes] Set domain error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

/**
 * Get site credentials
 * POST /get-site-credentials
 * 
 * Body: {
 *   apiKey: string,
 *   apiSecret: string,
 *   installId: string|number
 * }
 */
router.post('/get-site-credentials', async (req, res) => {
  console.log('[WP Engine Routes] POST /get-site-credentials - Request received');
  try {
    const { apiKey, apiSecret, installId } = req.body;
    
    if (!apiKey || !apiSecret || !installId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: apiKey, apiSecret, installId'
      });
    }
    
    const result = await getSiteCredentials(apiKey, apiSecret, installId);
    res.json(result);
  } catch (error) {
    console.error('[WP Engine Routes] Get site credentials error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

module.exports = router;

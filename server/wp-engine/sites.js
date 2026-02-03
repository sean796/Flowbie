/**
 * WP Engine Site Management
 * Operations for listing, creating, and managing WP Engine installs
 */

const WPEngineAPIClient = require('./api-client');

/**
 * List all installs for an account
 * @param {string} apiKey - WP Engine API key
 * @param {string} apiSecret - WP Engine API secret
 * @param {object} options - Query options
 * @returns {Promise<object>} List of installs
 */
async function listSites(apiKey, apiSecret, options = {}) {
  try {
    const client = new WPEngineAPIClient(apiKey, apiSecret);
    const result = await client.listInstalls(options);

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to list sites',
        sites: []
      };
    }

    return {
      success: true,
      sites: result.data?.results || result.data || [],
      total: result.data?.total || 0
    };
  } catch (error) {
    console.error('[WP Engine Sites] List sites error:', error);
    return {
      success: false,
      error: error.message || 'Failed to list sites',
      sites: []
    };
  }
}

/**
 * Create a new install/site
 * @param {string} apiKey - WP Engine API key
 * @param {string} apiSecret - WP Engine API secret
 * @param {object} installData - Install creation data
 * @returns {Promise<object>} Created install details
 */
async function createSite(apiKey, apiSecret, installData) {
  // #region agent log
  const fs = require('fs');
  const path = require('path');
  const logPath = path.join(__dirname, '..', '..', '.cursor', 'debug.log');
  try { fs.appendFileSync(logPath, JSON.stringify({location:'sites.js:50',message:'createSite entry',data:{hasApiKey:!!apiKey,hasApiSecret:!!apiSecret,installData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})+'\n'); } catch(e) {}
  // #endregion
  try {
    const client = new WPEngineAPIClient(apiKey, apiSecret);
    
    // Get account_id from existing installs (required for creating new installs)
    let accountId = installData.account_id;
    if (!accountId) {
      // #region agent log
      try { fs.appendFileSync(logPath, JSON.stringify({location:'sites.js:58',message:'Fetching account_id from existing installs',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})+'\n'); } catch(e) {}
      // #endregion
      
      const listResult = await client.listInstalls({ limit: 1 });
      if (listResult.success && listResult.data) {
        const installs = listResult.data.results || listResult.data;
        if (Array.isArray(installs) && installs.length > 0) {
          accountId = installs[0].account_id || installs[0].account?.id;
        } else if (listResult.data.account_id) {
          accountId = listResult.data.account_id;
        }
      }
      
      // #region agent log
      try { fs.appendFileSync(logPath, JSON.stringify({location:'sites.js:70',message:'Account ID fetched',data:{accountId,listSuccess:listResult.success},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})+'\n'); } catch(e) {}
      // #endregion
      
      if (!accountId) {
        return {
          success: false,
          error: 'Unable to determine account_id. Please ensure you have at least one existing install or provide account_id in installData.',
          install: null
        };
      }
    }
    
    // Sanitize site name: WP Engine requires:
    // - Must start with a letter
    // - Only letters and numbers (no hyphens, no special chars)
    // - Lowercase
    // - Maximum 14 characters
    let sanitizedName = (installData.name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')  // Remove all non-alphanumeric chars
      .substring(0, 14);           // WP Engine max is 14 characters
    
    // Ensure it starts with a letter (prepend 's' if it starts with a number)
    if (sanitizedName && /^[0-9]/.test(sanitizedName)) {
      sanitizedName = 's' + sanitizedName.substring(0, 13); // Keep total length <= 14
    }
    
    // If empty after sanitization, use a default
    if (!sanitizedName) {
      sanitizedName = 'site';
    }
    
    // DO NOT add timestamps or any other characters - use the name as-is (sanitized)
    // Ensure final name doesn't exceed 14 characters and still starts with letter
    if (sanitizedName.length > 14) {
      sanitizedName = sanitizedName.substring(0, 14);
    }
    if (!/^[a-z]/.test(sanitizedName)) {
      sanitizedName = 's' + sanitizedName.substring(0, 13); // Keep total length <= 14
    }
    
    // Strategy: Try creating install without site_id first (WP Engine will create site automatically)
    // If that fails with "site_id required", then create site first, then create install
    let createData = {
      name: sanitizedName,
      account_id: accountId
    };
    
    // Include environment if provided
    if (installData.environment) {
      createData.environment = installData.environment;
    }
    
    // Only include site_id if explicitly provided (for adding environments to existing sites)
    // When cloning/creating new sites, we should NOT provide site_id initially
    let siteId = installData.site_id;
    
    // #region agent log
    try { fs.appendFileSync(logPath, JSON.stringify({location:'sites.js:130',message:'Attempting install creation',data:{createData,hasSiteId:!!siteId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})+'\n'); } catch(e) {}
    // #endregion
    
    // Try creating install first (without site_id if not provided)
    if (!siteId) {
      // First attempt: create install without site_id (WP Engine should create site automatically)
      const result = await client.createInstall(createData);
      
      // #region agent log
      try { fs.appendFileSync(logPath, JSON.stringify({location:'sites.js:138',message:'First attempt result',data:{success:result.success,status:result.status,error:result.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})+'\n'); } catch(e) {}
      // #endregion
      
      if (result.success) {
        return {
          success: true,
          install: result.data,
          installId: result.data?.id || result.data?.install_id
        };
      }
      
      // If failed with "site_id required" or "site required", try creating site first
      const errorStr = (result.error || '').toLowerCase();
      if (errorStr.includes('site') && (errorStr.includes('required') || errorStr.includes('blank'))) {
        // #region agent log
        try { fs.appendFileSync(logPath, JSON.stringify({location:'sites.js:150',message:'Site required, creating site first',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})+'\n'); } catch(e) {}
        // #endregion
        
        // Create site first
        const siteResult = await client.createSite({
          name: sanitizedName,
          account_id: accountId
        });
        
        if (siteResult.success && siteResult.data?.id) {
          siteId = siteResult.data.id;
          createData.site_id = siteId;
          
          // #region agent log
          try { fs.appendFileSync(logPath, JSON.stringify({location:'sites.js:160',message:'Site created, retrying install creation',data:{siteId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})+'\n'); } catch(e) {}
          // #endregion
          
          // Retry install creation with site_id
          const retryResult = await client.createInstall(createData);
          
          // #region agent log
          try { fs.appendFileSync(logPath, JSON.stringify({location:'sites.js:165',message:'Retry attempt result',data:{success:retryResult.success,status:retryResult.status,error:retryResult.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})+'\n'); } catch(e) {}
          // #endregion
          
          if (retryResult.success) {
            return {
              success: true,
              install: retryResult.data,
              installId: retryResult.data?.id || retryResult.data?.install_id
            };
          }
          
          // If retry also failed, return the retry error
          return {
            success: false,
            error: retryResult.error || 'Failed to create install after creating site',
            install: null
          };
        } else {
          // Site creation failed
          return {
            success: false,
            error: `Failed to create site: ${siteResult.error || 'Unknown error'}`,
            install: null
          };
        }
      } else {
        // Other error, return it
        return {
          success: false,
          error: result.error || 'Failed to create site',
          install: null
        };
      }
    } else {
      // site_id was provided, use it directly
      createData.site_id = siteId;
    }
    
    // #region agent log
    try { fs.appendFileSync(logPath, JSON.stringify({location:'sites.js:95',message:'Site name sanitized and createData prepared',data:{originalName:installData.name,sanitizedName,createData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})+'\n'); } catch(e) {}
    // #endregion

    // #region agent log
    try { fs.appendFileSync(logPath, JSON.stringify({location:'sites.js:100',message:'Before createInstall API call',data:{createData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})+'\n'); } catch(e) {}
    // #endregion

    const result = await client.createInstall(createData);
    
    // #region agent log
    try { fs.appendFileSync(logPath, JSON.stringify({location:'sites.js:65',message:'After createInstall API call',data:{success:result.success,status:result.status,error:result.error,hasData:!!result.data,responseData:result.data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})+'\n'); } catch(e) {}
    // #endregion

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to create site',
        install: null
      };
    }

    return {
      success: true,
      install: result.data,
      installId: result.data?.id || result.data?.install_id
    };
  } catch (error) {
    console.error('[WP Engine Sites] Create site error:', error);
    return {
      success: false,
      error: error.message || 'Failed to create site',
      install: null
    };
  }
}

/**
 * Copy an existing install
 * @param {string} apiKey - WP Engine API key
 * @param {string} apiSecret - WP Engine API secret
 * @param {string|number} sourceInstallId - Source install ID
 * @param {object} copyData - Copy configuration
 * @returns {Promise<object>} Copied install details
 */
async function copySite(apiKey, apiSecret, sourceInstallId, copyData) {
  // #region agent log
  const fs = require('fs');
  const path = require('path');
  const logPath = path.join(__dirname, '..', '..', '.cursor', 'debug.log');
  try { fs.appendFileSync(logPath, JSON.stringify({location:'sites.js:94',message:'copySite entry',data:{hasApiKey:!!apiKey,hasApiSecret:!!apiSecret,sourceInstallId,copyConfig:{name:copyData.name,environment:copyData.environment}},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})+'\n'); } catch(e) {}
  // #endregion
  try {
    const client = new WPEngineAPIClient(apiKey, apiSecret);
    
    const copyConfig = {
      name: copyData.name,
      environment: copyData.environment || 'production',
      ...copyData
    };

    // #region agent log
    try { fs.appendFileSync(logPath, JSON.stringify({location:'sites.js:104',message:'Before copyInstall API call',data:{sourceInstallId,copyConfig},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})+'\n'); } catch(e) {}
    // #endregion

    const result = await client.copyInstall(sourceInstallId, copyConfig);

    // #region agent log
    try { fs.appendFileSync(logPath, JSON.stringify({location:'sites.js:106',message:'After copyInstall API call',data:{success:result.success,status:result.status,error:result.error,hasData:!!result.data,responseData:result.data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})+'\n'); } catch(e) {}
    // #endregion

    if (!result.success) {
      // Build detailed error message
      let errorMessage = result.error || 'Failed to copy site';
      
      // Add status code context
      if (result.status === 403) {
        errorMessage = `Access forbidden (403). ${errorMessage}. This may indicate insufficient API permissions or that the copy operation is not available for your account.`;
      } else if (result.status === 404) {
        errorMessage = `Source site not found (404). ${errorMessage}. Please verify the source site ID is correct.`;
      } else if (result.status) {
        errorMessage = `HTTP ${result.status}: ${errorMessage}`;
      }
      
      return {
        success: false,
        error: errorMessage,
        install: null
      };
    }

    return {
      success: true,
      install: result.data,
      installId: result.data?.id || result.data?.install_id
    };
  } catch (error) {
    console.error('[WP Engine Sites] Copy site error:', error);
    return {
      success: false,
      error: error.message || 'Failed to copy site',
      install: null
    };
  }
}

/**
 * Wait for site provisioning to complete
 * @param {string} apiKey - WP Engine API key
 * @param {string} apiSecret - WP Engine API secret
 * @param {string|number} installId - Install ID
 * @param {object} options - Polling options
 * @returns {Promise<object>} Provisioning result
 */
async function waitForProvisioning(apiKey, apiSecret, installId, options = {}) {
  const {
    maxWaitTime = 300000, // 5 minutes
    pollInterval = 5000, // 5 seconds
    statusCheck = (install) => install.status === 'active' || install.state === 'ready'
  } = options;

  const startTime = Date.now();
  const client = new WPEngineAPIClient(apiKey, apiSecret);

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const result = await client.getInstall(installId);

      if (result.success && result.data) {
        const install = result.data;
        
        if (statusCheck(install)) {
          return {
            success: true,
            install,
            ready: true
          };
        }

        // Check if install failed
        if (install.status === 'failed' || install.state === 'failed') {
          return {
            success: false,
            error: 'Site provisioning failed',
            install
          };
        }
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.error('[WP Engine Sites] Provisioning check error:', error);
      // Continue polling on error
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  // Timeout
  return {
    success: false,
    error: 'Site provisioning timeout',
    timeout: true
  };
}

/**
 * Get site credentials (auto-generated)
 * @param {string} apiKey - WP Engine API key
 * @param {string} apiSecret - WP Engine API secret
 * @param {string|number} installId - Install ID
 * @returns {Promise<object>} Site credentials
 */
async function getSiteCredentials(apiKey, apiSecret, installId) {
  try {
    const client = new WPEngineAPIClient(apiKey, apiSecret);
    const result = await client.getInstall(installId);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || 'Failed to get site credentials',
        credentials: null
      };
    }

    const install = result.data;
    
    // Extract credentials from install data
    // WP Engine typically provides these in the install object
    const credentials = {
      siteUrl: install.url || install.cname || `https://${install.name}.wpengine.com`,
      adminUrl: install.admin_url || `${install.url || `https://${install.name}.wpengine.com`}/wp-admin`,
      username: install.admin_username || 'wpengine',
      password: install.admin_password || null, // May not be available via API
      ftpHost: install.ftp_host || install.name + '.wpengine.com',
      ftpUsername: install.ftp_username || install.name,
      ftpPassword: install.ftp_password || null
    };

    return {
      success: true,
      credentials,
      install
    };
  } catch (error) {
    console.error('[WP Engine Sites] Get credentials error:', error);
    return {
      success: false,
      error: error.message || 'Failed to get site credentials',
      credentials: null
    };
  }
}

module.exports = {
  listSites,
  createSite,
  copySite,
  waitForProvisioning,
  getSiteCredentials
};

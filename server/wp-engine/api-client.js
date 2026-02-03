/**
 * WP Engine API Client
 * Base API client with authentication and request methods
 * Uses WP Engine API v1: https://api.wpengineapi.com/v1
 */

const axios = require('axios');

class WPEngineAPIClient {
  constructor(apiKey, apiSecret) {
    this.baseUrl = 'https://api.wpengineapi.com/v1';
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  }

  /**
   * Make authenticated request to WP Engine API
   * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
   * @param {string} endpoint - API endpoint (without base URL)
   * @param {object} data - Request body data (for POST/PUT)
   * @param {object} options - Additional options (timeout, retries, etc.)
   * @returns {Promise<object>} Response data
   */
  async request(method, endpoint, data = null, options = {}) {
    // #region agent log
    const fs = require('fs');
    const path = require('path');
    const logPath = path.join(__dirname, '..', '..', '.cursor', 'debug.log');
    // #endregion
    const {
      timeout = 30000,
      retries = 3,
      retryDelay = 1000,
      validateStatus = (status) => status < 500
    } = options;

    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    
    // Use axios built-in auth for more reliable Basic Auth handling
    const config = {
      method,
      url,
      auth: {
        username: this.apiKey,
        password: this.apiSecret
      },
      headers: {
        'Content-Type': 'application/json'
      },
      timeout,
      validateStatus
    };
    
    // #region agent log
    try { fs.appendFileSync(logPath, JSON.stringify({location:'api-client.js:40',message:'Request config prepared',data:{method:config.method,url:config.url,hasAuth:!!config.auth,hasApiKey:!!this.apiKey,hasApiSecret:!!this.apiSecret},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})+'\n'); } catch(e) {}
    // #endregion

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      config.data = data;
    }

    let lastError;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await axios(config);
        // #region agent log
        try { fs.appendFileSync(logPath, JSON.stringify({location:'api-client.js:53',message:'API response received',data:{method:config.method,url:config.url,status:response.status,responseData:response.data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})+'\n'); } catch(e) {}
        // #endregion
        
        const isSuccess = response.status >= 200 && response.status < 300;
        
        // Extract error message from response data if status is not success
        let errorMessage = null;
        if (!isSuccess && response.data) {
          // Try various common error message fields
          if (typeof response.data === 'string') {
            errorMessage = response.data;
          } else if (response.data.message) {
            // If there are detailed errors array, combine them with the main message
            if (response.data.errors && Array.isArray(response.data.errors) && response.data.errors.length > 0) {
              const errorDetails = response.data.errors.map(err => {
                const field = err.field || '';
                const msg = err.message || '';
                return field ? `${field}: ${msg}` : msg;
              }).filter(Boolean).join('; ');
              errorMessage = `${response.data.message}. ${errorDetails}`;
            } else {
              errorMessage = response.data.message;
            }
          } else if (response.data.error) {
            errorMessage = response.data.error;
          } else if (response.data.error_message) {
            errorMessage = response.data.error_message;
          } else if (response.data.detail) {
            errorMessage = response.data.detail;
          } else if (Array.isArray(response.data) && response.data.length > 0) {
            // Sometimes errors come as arrays
            errorMessage = response.data[0].message || response.data[0].error || JSON.stringify(response.data[0]);
          } else if (response.data.errors && Array.isArray(response.data.errors)) {
            // Extract from errors array
            errorMessage = response.data.errors.map(err => err.message || JSON.stringify(err)).join('; ');
          } else {
            // Fallback: stringify the entire response data
            errorMessage = JSON.stringify(response.data);
          }
          
          // If still no message, use status
          if (!errorMessage) {
            errorMessage = `HTTP ${response.status} ${response.statusText || ''}`.trim();
          }
        }
        
        return {
          success: isSuccess,
          status: response.status,
          data: response.data,
          headers: response.headers,
          error: errorMessage
        };
      } catch (error) {
        lastError = error;
        
        // #region agent log
        try { fs.appendFileSync(logPath, JSON.stringify({location:'api-client.js:61',message:'API request error',data:{hasResponse:!!error.response,status:error.response?.status,statusText:error.response?.statusText,errorMessage:error.message,errorData:error.response?.data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})+'\n'); } catch(e) {}
        // #endregion
        
        // Don't retry on 4xx errors (client errors)
        if (error.response && error.response.status >= 400 && error.response.status < 500) {
          return {
            success: false,
            status: error.response.status,
            data: error.response.data,
            error: error.response.data?.message || error.message
          };
        }

        // Retry on network errors or 5xx errors
        if (attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
          continue;
        }
      }
    }

    // All retries failed
    if (lastError.response) {
      return {
        success: false,
        status: lastError.response.status,
        data: lastError.response.data,
        error: lastError.response.data?.message || lastError.message
      };
    }

    return {
      success: false,
      status: 0,
      error: lastError.message || 'Request failed after retries'
    };
  }

  /**
   * Test connection to WP Engine API
   * @returns {Promise<object>} Test result
   */
  async testConnection() {
    try {
      const result = await this.request('GET', '/installs?limit=1', null, {
        timeout: 10000,
        retries: 1
      });

      return {
        success: result.success && result.status === 200,
        status: result.status,
        message: result.success 
          ? 'WP Engine API connection successful'
          : result.error || 'Connection failed',
        data: result.data
      };
    } catch (error) {
      return {
        success: false,
        status: 0,
        message: error.message || 'Connection test failed',
        error: error.message
      };
    }
  }

  /**
   * List all installs for the account
   * @param {object} options - Query options (limit, offset, etc.)
   * @returns {Promise<object>} List of installs
   */
  async listInstalls(options = {}) {
    const { limit = 100, offset = 0 } = options;
    const endpoint = `/installs?limit=${limit}&offset=${offset}`;
    return await this.request('GET', endpoint);
  }

  /**
   * Get install details by ID
   * @param {string|number} installId - Install ID
   * @returns {Promise<object>} Install details
   */
  async getInstall(installId) {
    return await this.request('GET', `/installs/${installId}`);
  }

  /**
   * Create a new site
   * @param {object} siteData - Site creation data (name, account_id)
   * @returns {Promise<object>} Created site details
   */
  async createSite(siteData) {
    // #region agent log
    const fs = require('fs');
    const path = require('path');
    const logPath = path.join(__dirname, '..', '..', '.cursor', 'debug.log');
    try { fs.appendFileSync(logPath, JSON.stringify({location:'api-client.js:177',message:'createSite entry',data:{siteData,endpoint:'/sites'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})+'\n'); } catch(e) {}
    // #endregion
    const result = await this.request('POST', '/sites', siteData);
    // #region agent log
    try { fs.appendFileSync(logPath, JSON.stringify({location:'api-client.js:180',message:'createSite result',data:{success:result.success,status:result.status,error:result.error,hasData:!!result.data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})+'\n'); } catch(e) {}
    // #endregion
    return result;
  }

  /**
   * Create a new install
   * @param {object} installData - Install creation data
   * @returns {Promise<object>} Created install details
   */
  async createInstall(installData) {
    // #region agent log
    const fs = require('fs');
    const path = require('path');
    const logPath = path.join(__dirname, '..', '..', '.cursor', 'debug.log');
    try { fs.appendFileSync(logPath, JSON.stringify({location:'api-client.js:192',message:'createInstall entry',data:{installData,endpoint:'/installs'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})+'\n'); } catch(e) {}
    // #endregion
    const result = await this.request('POST', '/installs', installData);
    // #region agent log
    try { fs.appendFileSync(logPath, JSON.stringify({location:'api-client.js:195',message:'createInstall result',data:{success:result.success,status:result.status,error:result.error,hasData:!!result.data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})+'\n'); } catch(e) {}
    // #endregion
    return result;
  }

  /**
   * Copy an existing install
   * @param {string|number} sourceInstallId - Source install ID
   * @param {object} copyData - Copy configuration
   * @returns {Promise<object>} Copied install details
   */
  async copyInstall(sourceInstallId, copyData) {
    // #region agent log
    const fs = require('fs');
    const path = require('path');
    const logPath = path.join(__dirname, '..', '..', '.cursor', 'debug.log');
    try { fs.appendFileSync(logPath, JSON.stringify({location:'api-client.js:162',message:'copyInstall entry',data:{sourceInstallId,copyData,endpoint:`/installs/${sourceInstallId}/copy`},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})+'\n'); } catch(e) {}
    // #endregion
    const result = await this.request('POST', `/installs/${sourceInstallId}/copy`, copyData);
    // #region agent log
    try { fs.appendFileSync(logPath, JSON.stringify({location:'api-client.js:164',message:'copyInstall result',data:{success:result.success,status:result.status,error:result.error,hasData:!!result.data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})+'\n'); } catch(e) {}
    // #endregion
    return result;
  }

  /**
   * Set domain for an install
   * @param {string|number} installId - Install ID
   * @param {string} domain - Domain name
   * @returns {Promise<object>} Domain assignment result
   */
  async setDomain(installId, domain) {
    // #region agent log
    const fs = require('fs');
    const path = require('path');
    const logPath = path.join(__dirname, '..', '..', '.cursor', 'debug.log');
    try { fs.appendFileSync(logPath, JSON.stringify({location:'api-client.js:252',message:'setDomain entry',data:{installId,domain,endpoint:`/installs/${installId}/domains`},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})+'\n'); } catch(e) {}
    // #endregion
    // WP Engine API expects 'name' field, not 'domain'
    const result = await this.request('POST', `/installs/${installId}/domains`, { name: domain });
    // #region agent log
    try { fs.appendFileSync(logPath, JSON.stringify({location:'api-client.js:256',message:'setDomain result',data:{success:result.success,status:result.status,error:result.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})+'\n'); } catch(e) {}
    // #endregion
    return result;
  }

  /**
   * Get domains for an install
   * @param {string|number} installId - Install ID
   * @returns {Promise<object>} List of domains
   */
  async getDomains(installId) {
    return await this.request('GET', `/installs/${installId}/domains`);
  }
}

module.exports = WPEngineAPIClient;

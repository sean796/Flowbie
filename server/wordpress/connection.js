/**
 * WordPress Connection Routes
 * POST /test-connection - Test WordPress connection
 */

const express = require('express');
const axios = require('axios');
const { normalizeUrl, getAuthConfig } = require('./utils');

const router = express.Router();

/**
 * Test WordPress connection
 * POST /test-connection
 */
router.post('/test-connection', async (req, res) => {
  console.log('[WordPress Routes] POST /test-connection - Request received');
  try {
    const { siteUrl, username, appPassword } = req.body;
    
    if (!siteUrl || !username || !appPassword) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: siteUrl, username, appPassword'
      });
    }
    
    // Normalize URL
    const normalizedUrl = normalizeUrl(siteUrl);
    
    // Use WordPress REST API users/me endpoint to test connection
    // This is a standard WordPress REST API endpoint that requires authentication
    const apiUrl = `${normalizedUrl}/wp-json/wp/v2/users/me`;
    
    console.log(`[WordPress] Testing connection to: ${apiUrl}`);
    
    try {
      // Use latest WordPress REST API protocol with proper headers
      const authConfig = getAuthConfig(username, appPassword, {
        timeout: 10000,
        validateStatus: (status) => status < 500, // Accept 401, 404, etc. as valid responses
        extra: {
          maxRedirects: 5
        }
      });
      
      const response = await axios.get(apiUrl, authConfig);
      
      if (response.status === 200) {
        // Get site info from WordPress REST API
        const siteInfoUrl = `${normalizedUrl}/wp-json/`;
        let siteInfo = { name: 'WordPress Site', description: '', url: normalizedUrl };
        
        try {
          const siteResponse = await axios.get(siteInfoUrl, { timeout: 5000 });
          if (siteResponse.data?.name) {
            siteInfo.name = siteResponse.data.name;
            siteInfo.description = siteResponse.data.description || '';
            siteInfo.url = siteResponse.data.url || normalizedUrl;
          }
        } catch (e) {
          // Use user data as fallback
          if (response.data?.name) {
            siteInfo.name = response.data.name + "'s Site";
          }
        }
        
        res.json({
          success: true,
          message: 'Connection successful',
          siteInfo: siteInfo
        });
      } else if (response.status === 401) {
        res.json({
          success: false,
          message: 'Authentication failed. Please check your username and application password.'
        });
      } else {
        res.json({
          success: false,
          message: `WordPress API returned status ${response.status}`
        });
      }
    } catch (error) {
      if (error.response) {
        if (error.response.status === 401) {
          res.json({
            success: false,
            message: 'Authentication failed. Please check your username and application password.'
          });
        } else if (error.response.status === 404) {
          res.json({
            success: false,
            message: 'WordPress REST API not found. Is this a WordPress site?'
          });
        } else {
          res.json({
            success: false,
            message: `WordPress API error: ${error.response.status} ${error.response.statusText}`
          });
        }
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        res.json({
          success: false,
          message: 'Cannot reach WordPress site. Please check the URL.'
        });
      } else if (error.code === 'ETIMEDOUT') {
        res.json({
          success: false,
          message: 'Connection timeout. The site may be slow or unreachable.'
        });
      } else {
        res.json({
          success: false,
          message: `Connection error: ${error.message}`
        });
      }
    }
  } catch (error) {
    console.error('[WordPress] Test connection error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

module.exports = router;




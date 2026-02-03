/**
 * WP Engine Domain Management
 * Operations for setting and verifying domains on WP Engine installs
 */

const WPEngineAPIClient = require('./api-client');

/**
 * Set domain for an install
 * @param {string} apiKey - WP Engine API key
 * @param {string} apiSecret - WP Engine API secret
 * @param {string|number} installId - Install ID
 * @param {string} domain - Domain name (without protocol)
 * @returns {Promise<object>} Domain assignment result
 */
async function setDomain(apiKey, apiSecret, installId, domain) {
  try {
    // Remove protocol if present
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

    const client = new WPEngineAPIClient(apiKey, apiSecret);
    const result = await client.setDomain(installId, cleanDomain);

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to set domain',
        domain: null
      };
    }

    return {
      success: true,
      domain: cleanDomain,
      data: result.data
    };
  } catch (error) {
    console.error('[WP Engine Domains] Set domain error:', error);
    return {
      success: false,
      error: error.message || 'Failed to set domain',
      domain: null
    };
  }
}

/**
 * Verify domain assignment
 * @param {string} apiKey - WP Engine API key
 * @param {string} apiSecret - WP Engine API secret
 * @param {string|number} installId - Install ID
 * @param {string} domain - Domain name to verify
 * @returns {Promise<object>} Verification result
 */
async function verifyDomain(apiKey, apiSecret, installId, domain) {
  try {
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

    const client = new WPEngineAPIClient(apiKey, apiSecret);
    const result = await client.getDomains(installId);

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to verify domain',
        verified: false
      };
    }

    const domains = result.data?.results || result.data || [];
    const domainList = Array.isArray(domains) ? domains : [domains];
    
    // Check if domain exists in the list
    const isVerified = domainList.some(d => {
      const dName = typeof d === 'string' ? d : d.domain || d.name;
      return dName === cleanDomain || dName === `https://${cleanDomain}` || dName === `http://${cleanDomain}`;
    });

    return {
      success: true,
      verified: isVerified,
      domains: domainList,
      domain: cleanDomain
    };
  } catch (error) {
    console.error('[WP Engine Domains] Verify domain error:', error);
    return {
      success: false,
      error: error.message || 'Failed to verify domain',
      verified: false
    };
  }
}

/**
 * Get all domains for an install
 * @param {string} apiKey - WP Engine API key
 * @param {string} apiSecret - WP Engine API secret
 * @param {string|number} installId - Install ID
 * @returns {Promise<object>} List of domains
 */
async function getDomains(apiKey, apiSecret, installId) {
  try {
    const client = new WPEngineAPIClient(apiKey, apiSecret);
    const result = await client.getDomains(installId);

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to get domains',
        domains: []
      };
    }

    const domains = result.data?.results || result.data || [];
    const domainList = Array.isArray(domains) ? domains : [domains];

    return {
      success: true,
      domains: domainList
    };
  } catch (error) {
    console.error('[WP Engine Domains] Get domains error:', error);
    return {
      success: false,
      error: error.message || 'Failed to get domains',
      domains: []
    };
  }
}

module.exports = {
  setDomain,
  verifyDomain,
  getDomains
};

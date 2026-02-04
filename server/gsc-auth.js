/**
 * Google Search Console Authentication
 * Handles service account authentication for GSC API
 */

const { google } = require('googleapis');
const { GSC_SERVICE_ACCOUNT } = require('./gsc-config');

/**
 * Helper function to authenticate with GSC API
 * @param {boolean} requireWriteAccess - If true, uses full webmasters scope. Otherwise, readonly.
 */
async function authenticateGSC(requireWriteAccess = false) {
  if (!GSC_SERVICE_ACCOUNT) {
    throw new Error('GSC credentials not configured. Set GSC_SERVICE_ACCOUNT_JSON env var to your service account JSON string.');
  }
  const scope = requireWriteAccess 
    ? 'https://www.googleapis.com/auth/webmasters' 
    : 'https://www.googleapis.com/auth/webmasters.readonly';
  
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: GSC_SERVICE_ACCOUNT.client_email,
      private_key: GSC_SERVICE_ACCOUNT.private_key,
      project_id: GSC_SERVICE_ACCOUNT.project_id,
    },
    scopes: [scope],
  });
  
  return await auth.getClient();
}

module.exports = {
  authenticateGSC
};





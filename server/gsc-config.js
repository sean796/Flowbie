/**
 * Google Search Console Configuration
 * Service account credentials from env (never commit secrets).
 * Set GSC_SERVICE_ACCOUNT_JSON to the full JSON key string in production/local .env.
 */

let GSC_SERVICE_ACCOUNT = null;
if (process.env.GSC_SERVICE_ACCOUNT_JSON) {
  try {
    GSC_SERVICE_ACCOUNT = JSON.parse(process.env.GSC_SERVICE_ACCOUNT_JSON);
  } catch (e) {
    console.warn('[GSC] Invalid GSC_SERVICE_ACCOUNT_JSON');
  }
}

module.exports = {
  GSC_SERVICE_ACCOUNT
};

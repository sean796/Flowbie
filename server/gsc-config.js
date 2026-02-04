/**
 * Google Search Console Configuration
 * Local: use server/credentials/gsc-service-account.json (proper multi-line JSON).
 * Production (e.g. Render): set GSC_SERVICE_ACCOUNT_JSON env var (file not deployed).
 */

const path = require('path');
const fs = require('fs');

let GSC_SERVICE_ACCOUNT = null;

function normalizePrivateKey(creds) {
  if (creds && creds.private_key && typeof creds.private_key === 'string') {
    creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  }
  return creds;
}

// Prefer credentials file (proper format, real newlines in key)
const credPath = path.join(__dirname, 'credentials', 'gsc-service-account.json');
if (fs.existsSync(credPath)) {
  try {
    GSC_SERVICE_ACCOUNT = normalizePrivateKey(JSON.parse(fs.readFileSync(credPath, 'utf8')));
  } catch (e) {
    console.warn('[GSC] Could not load', credPath, e.message);
  }
}

// Production: no file deployed, use env
if (!GSC_SERVICE_ACCOUNT && process.env.GSC_SERVICE_ACCOUNT_JSON) {
  try {
    GSC_SERVICE_ACCOUNT = normalizePrivateKey(JSON.parse(process.env.GSC_SERVICE_ACCOUNT_JSON));
  } catch (e) {
    console.warn('[GSC] Invalid GSC_SERVICE_ACCOUNT_JSON:', e.message);
  }
}

/** Service account email for error messages (no secret data). */
const GSC_SERVICE_ACCOUNT_EMAIL = GSC_SERVICE_ACCOUNT ? GSC_SERVICE_ACCOUNT.client_email : null;

/** Builds the standard error payload when no valid GSC property is found (403/404). */
function gscPropertyErrorPayload() {
  const payload = {
    success: false,
    error: 'Failed to find valid GSC property. Please verify the site URL and service account permissions.'
  };
  if (GSC_SERVICE_ACCOUNT_EMAIL) {
    payload.serviceAccountEmail = GSC_SERVICE_ACCOUNT_EMAIL;
    payload.hint = 'In Google Search Console, go to Settings → Users and permissions, add the user above with at least Restricted access for the property that matches this site. In Google Cloud Console (project flowbie-483717), enable "Google Search Console API" if needed.';
  }
  return payload;
}

module.exports = {
  GSC_SERVICE_ACCOUNT,
  GSC_SERVICE_ACCOUNT_EMAIL,
  gscPropertyErrorPayload
};

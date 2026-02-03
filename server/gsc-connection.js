/**
 * Google Search Console Connection Routes
 * Handles connection testing and site listing
 */

const express = require('express');
const { google } = require('googleapis');
const { authenticateGSC } = require('./gsc-auth');
const { normalizeGSCSiteUrl } = require('./gsc-property-utils');
const { GSC_SERVICE_ACCOUNT } = require('./gsc-config');

const router = express.Router();

/**
 * Test GSC connection by listing available sites
 * GET /test-connection
 */
router.get('/test-connection', async (req, res) => {
  console.log('[GSC Routes] GET /test-connection - Request received');
  try {
    // Authenticate with service account
    const authClient = await authenticateGSC(false);
    
    console.log('[GSC Test] Authentication successful');
    
    // Create GSC API client using searchconsole (v1) for sites.list()
    const searchconsole = google.searchconsole({
      version: 'v1',
      auth: authClient
    });
    
    // List all sites the service account has access to
    console.log('[GSC Test] Calling sites.list()...');
    const response = await searchconsole.sites.list();
    
    const sites = response.data.siteEntry || [];
    
    // Normalize ALL sites to consistent https:// format
    const normalizedSites = sites.map(site => {
      let originalUrl = (site.siteUrl || '').trim();
      let normalizedUrl = '';
      
      // SIMPLE, DIRECT CHECK: If it contains "sc-domain:", convert it immediately
      if (originalUrl && typeof originalUrl === 'string' && originalUrl.toLowerCase().indexOf('sc-domain:') !== -1) {
        // Direct extraction - no regex needed, just find the colon and take everything after
        const colonIndex = originalUrl.toLowerCase().indexOf('sc-domain:');
        if (colonIndex !== -1) {
          const afterColon = originalUrl.substring(colonIndex + 'sc-domain:'.length).trim();
          // Clean up the domain
          const domain = afterColon.replace(/^https?:\/\//i, '').split('/')[0].split('?')[0].split('#')[0].trim();
          if (domain) {
            normalizedUrl = `https://${domain}/`;
            console.log(`[GSC Normalize] DIRECT FIX: "${originalUrl}" → "${normalizedUrl}"`);
          }
        }
      }
      
      // If we didn't fix it above, use the normalization function
      if (!normalizedUrl || !normalizedUrl.startsWith('https://')) {
        normalizedUrl = normalizeGSCSiteUrl(originalUrl);
      }
      
      // ABSOLUTE FINAL CHECK - if it still has sc-domain: or doesn't start with https://, force it
      if (normalizedUrl.toLowerCase().indexOf('sc-domain:') !== -1 || !normalizedUrl.toLowerCase().startsWith('https://')) {
        console.error(`[GSC Normalize] CRITICAL: Still has sc-domain or invalid format: "${normalizedUrl}" from "${originalUrl}"`);
        // Last resort: brute force extraction
        let domain = normalizedUrl.replace(/sc-domain\s*:\s*/gi, '').replace(/^https?:\/\//i, '').split('/')[0].split('?')[0].split('#')[0].trim();
        if (!domain) {
          domain = originalUrl.replace(/sc-domain\s*:\s*/gi, '').replace(/^https?:\/\//i, '').split('/')[0].split('?')[0].split('#')[0].trim();
        }
        if (domain) {
          normalizedUrl = `https://${domain}/`;
          console.log(`[GSC Normalize] BRUTE FORCE FIX: "${originalUrl}" → "${normalizedUrl}"`);
        } else {
          console.error(`[GSC Normalize] FATAL: Cannot extract domain from "${originalUrl}"`);
          normalizedUrl = originalUrl; // Fallback to original if we can't fix it
        }
      }
      
      console.log(`[GSC Normalize] RESULT: "${originalUrl}" → "${normalizedUrl}"`);
      
      return {
        siteUrl: normalizedUrl,
        permissionLevel: site.permissionLevel,
        originalFormat: originalUrl // Keep original for reference
      };
    });
    
    // FINAL SANITY CHECK - Force normalize ALL sites one more time before sending
    // This is the LAST chance to fix any sc-domain: entries
    const finalNormalizedSites = normalizedSites.map(site => {
      let finalUrl = String(site.siteUrl || '').trim();
      const originalFinal = finalUrl;
      
      // ULTIMATE CHECK: If it contains "sc-domain:" anywhere, fix it immediately
      const lowerFinal = finalUrl.toLowerCase();
      if (lowerFinal.indexOf('sc-domain:') !== -1) {
        console.error(`[GSC FINAL FIX] CRITICAL: Found sc-domain in "${finalUrl}"`);
        // Find the position of sc-domain:
        const pos = lowerFinal.indexOf('sc-domain:');
        // Extract everything after sc-domain:
        let domain = finalUrl.substring(pos + 'sc-domain:'.length).trim();
        // Clean it up
        domain = domain.replace(/^https?:\/\//i, '').split('/')[0].split('?')[0].split('#')[0].trim();
        if (domain) {
          finalUrl = `https://${domain}/`;
          console.log(`[GSC FINAL FIX] SUCCESS: "${originalFinal}" → "${finalUrl}"`);
        }
      }
      
      // Ensure it starts with https://
      if (!finalUrl.toLowerCase().startsWith('https://')) {
        console.error(`[GSC FINAL FIX] CRITICAL: URL doesn't start with https://: "${finalUrl}"`);
        // Last resort cleanup
        let domain = finalUrl.replace(/sc-domain\s*:\s*/gi, '').replace(/^https?:\/\//i, '').split('/')[0].split('?')[0].split('#')[0].trim();
        if (domain) {
          finalUrl = `https://${domain}/`;
          console.log(`[GSC FINAL FIX] LAST RESORT: "${originalFinal}" → "${finalUrl}"`);
        }
      }
      
      // VERIFY it's clean
      if (finalUrl.toLowerCase().indexOf('sc-domain:') !== -1) {
        console.error(`[GSC FINAL FIX] FATAL ERROR: Still contains sc-domain after all fixes: "${finalUrl}"`);
      }
      
      return {
        siteUrl: finalUrl,
        permissionLevel: site.permissionLevel,
        originalFormat: site.originalFormat
      };
    });
    
    console.log(`[GSC Test] Found ${sites.length} site(s):`, finalNormalizedSites.map(s => s.siteUrl));
    console.log(`[GSC Test] Original formats:`, sites.map(s => s.siteUrl));
    console.log(`[GSC Test] VERIFICATION - Any sc-domain remaining?`, finalNormalizedSites.filter(s => s.siteUrl.toLowerCase().includes('sc-domain')));
    
    res.json({
      success: true,
      connected: true,
      siteCount: finalNormalizedSites.length,
      sites: finalNormalizedSites,
      serviceAccount: GSC_SERVICE_ACCOUNT.client_email,
      message: finalNormalizedSites.length > 0 
        ? `Successfully connected! Found ${finalNormalizedSites.length} site(s) in Google Search Console.`
        : 'Connected successfully, but no sites found. Please verify the service account has access to properties in GSC.'
    });
    
  } catch (error) {
    console.error('[GSC Test] Error testing connection:', error);
    console.error('[GSC Test] Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      response: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      } : null
    });
    
    // Handle specific errors
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;
      
      if (status === 403) {
        return res.status(403).json({
          success: false,
          connected: false,
          error: 'Access denied. The service account does not have permission to access Google Search Console.',
          details: errorData?.error?.message || 'Forbidden',
          serviceAccount: GSC_SERVICE_ACCOUNT.client_email,
          troubleshooting: {
            step1: 'Go to Google Search Console → Settings → Users and permissions',
            step2: `Add ${GSC_SERVICE_ACCOUNT.client_email} as a user`,
            step3: 'Grant at least "Full" permissions',
            step4: 'Wait a few minutes for permissions to propagate'
          }
        });
      } else if (status === 401) {
        return res.status(401).json({
          success: false,
          connected: false,
          error: 'Authentication failed. Please check service account credentials.',
          details: errorData?.error?.message || 'Unauthorized'
        });
      } else {
        return res.status(status).json({
          success: false,
          connected: false,
          error: `GSC API error: ${errorData?.error?.message || error.message}`,
          details: errorData?.error || errorData
        });
      }
    }
    
    // Handle authentication errors
    if (error.message && error.message.includes('JWT')) {
      return res.status(401).json({
        success: false,
        connected: false,
        error: 'Authentication failed. Please check service account credentials.',
        details: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      connected: false,
      error: error.message || 'Failed to test GSC connection',
      errorType: error.name || 'UnknownError'
    });
  }
});

module.exports = router;





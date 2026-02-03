/**
 * Google Search Console Queries Routes
 * Handles fetching search queries from GSC API
 */

const express = require('express');
const { google } = require('googleapis');
const { authenticateGSC } = require('./gsc-auth');
const { findMatchingGSCProperty, generatePropertyCandidates } = require('./gsc-property-utils');
const { validateDates } = require('./gsc-validation');
const { GSC_SERVICE_ACCOUNT } = require('./gsc-config');

const router = express.Router();

router.post('/fetch-queries', async (req, res) => {
  console.log('[GSC Routes] POST /fetch-queries - Request received');
  try {
    const { siteUrl, startDate, endDate } = req.body;
    
    // Validate required fields (no credentials needed - they're in backend)
    if (!siteUrl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: siteUrl'
      });
    }
    
    // Validate dates
    const dateValidation = validateDates(startDate, endDate);
    if (!dateValidation.valid) {
      return res.status(400).json({
        success: false,
        error: dateValidation.error || 'Invalid date range'
      });
    }
    
    const startDateStr = dateValidation.startDateStr;
    const endDateStr = dateValidation.endDateStr;

    const { writeReportDateRange } = require('./report-date-range-writer');
    writeReportDateRange({ startDate: startDateStr, endDate: endDateStr });

    console.log(`[GSC] Fetching queries for ${siteUrl} from ${startDateStr} to ${endDateStr}`);
    if (GSC_SERVICE_ACCOUNT) console.log(`[GSC] Service account: ${GSC_SERVICE_ACCOUNT.client_email}`);
    
    // Authenticate with service account
    const authClient = await authenticateGSC(false);
    
    console.log('[GSC] Authentication successful');
    
    // Create GSC API client
    const webmasters = google.webmasters({
      version: 'v3',
      auth: authClient
    });
    
    // First, try to find the exact property format from GSC's list of available properties
    const exactProperty = await findMatchingGSCProperty(siteUrl);
    let propertyCandidates = [];
    
    if (exactProperty) {
      // Convert sc-domain format to URL prefix format to match all other sites
      // Try URL prefix first (like all other sites), then fall back to sc-domain if needed
      if (exactProperty.startsWith('sc-domain:')) {
        const domain = exactProperty.replace(/^sc-domain:/, '');
        propertyCandidates = [
          `https://${domain}/`,  // Try URL prefix first (same as all other sites)
          `https://${domain}`,   // Without trailing slash
          exactProperty          // Fallback to sc-domain if URL prefix doesn't work
        ];
        console.log(`[GSC] Found sc-domain property, trying URL prefix format first (like all other sites): "${propertyCandidates[0]}"`);
      } else {
        // Already URL prefix format, use it directly
        propertyCandidates = [exactProperty];
        console.log(`[GSC] Using URL prefix format from GSC: "${exactProperty}"`);
      }
    } else {
      // Fallback to generating candidates
      propertyCandidates = generatePropertyCandidates(siteUrl);
      console.log(`[GSC] Property candidates to try:`, propertyCandidates);
    }
    
    let lastError = null;
    let successfulProperty = null;
    let response = null;
    
    // Try each property format until one works
    for (let i = 0; i < propertyCandidates.length; i++) {
      const property = propertyCandidates[i];
      const isLastAttempt = i === propertyCandidates.length - 1;
      
      try {
        console.log(`[GSC] Attempt ${i + 1}/${propertyCandidates.length}: Trying property format: "${property}"`);
        console.log(`[GSC] Request details:`, {
          siteUrl: property,
          startDate: startDateStr,
          endDate: endDateStr,
          dimensions: ['query'],
          rowLimit: 10000
        });
        
        // Fetch search analytics data
        response = await webmasters.searchanalytics.query({
          siteUrl: property,
          requestBody: {
            startDate: startDateStr,
            endDate: endDateStr,
            dimensions: ['query'],
            rowLimit: 10000, // Maximum allowed by GSC API
            startRow: 0
          }
        });
        
        // If we get here, the property format worked!
        successfulProperty = property;
        console.log(`[GSC] ✅ Successfully connected using property: "${property}"`);
        break;
        
      } catch (error) {
        lastError = error;
        const errorStatus = error.response?.status;
        const errorData = error.response?.data;
        const errorHeaders = error.response?.headers;
        
        console.error(`[GSC] ❌ Property format "${property}" failed:`);
        console.error(`[GSC]   HTTP Status: ${errorStatus || 'unknown'}`);
        console.error(`[GSC]   Error Message: ${error.message}`);
        console.error(`[GSC]   Error Code: ${error.code || 'unknown'}`);
        
        if (errorData) {
          console.error(`[GSC]   Full Error Response:`, JSON.stringify(errorData, null, 2));
          
          // Extract specific error details from Google's response
          if (errorData.error) {
            console.error(`[GSC]   Google Error Code: ${errorData.error.code || 'unknown'}`);
            console.error(`[GSC]   Google Error Message: ${errorData.error.message || 'none'}`);
            if (errorData.error.errors) {
              console.error(`[GSC]   Google Error Details:`, JSON.stringify(errorData.error.errors, null, 2));
            }
          }
        }
        
        if (errorHeaders) {
          console.error(`[GSC]   Response Headers:`, JSON.stringify(errorHeaders, null, 2));
        }
        
        // Log the request that failed
        console.error(`[GSC]   Failed Request:`, {
          method: 'POST',
          url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
          property: property,
          serviceAccount: GSC_SERVICE_ACCOUNT.client_email
        });
        
        // Continue trying other formats even on 403 - the property might exist in a different format
        // A 403 on one format doesn't mean all formats will fail
        if (errorStatus === 404 || errorStatus === 403) {
          if (!isLastAttempt) {
            console.log(`[GSC]   ${errorStatus} for "${property}" - trying next format...`);
          } else {
            console.error(`[GSC]   All property formats exhausted. Last attempt was ${errorStatus}.`);
          }
          continue;
        } else {
          // For other errors, log but continue trying other formats
          console.log(`[GSC]   Non-404/403 error for "${property}" (${errorStatus || 'unknown'}) - trying next format...`);
          continue;
        }
      }
    }
    
    // If all property formats failed or 403 stopped the loop
    if (!response || !successfulProperty) {
      const triedFormats = propertyCandidates.map((f, i) => `${i + 1}. "${f}"`).join('\n   ');
      const lastErrorStatus = lastError?.response?.status;
      const lastErrorData = lastError?.response?.data;
      const lastErrorMessage = lastError?.message;
      const googleErrorCode = lastErrorData?.error?.code;
      const googleErrorMessage = lastErrorData?.error?.message;
      const googleErrorDetails = lastErrorData?.error?.errors;
      
      console.error(`[GSC] ========================================`);
      console.error(`[GSC] ALL PROPERTY FORMATS FAILED`);
      console.error(`[GSC] ========================================`);
      console.error(`[GSC] Original Site URL: ${siteUrl}`);
      console.error(`[GSC] Service Account: ${GSC_SERVICE_ACCOUNT.client_email}`);
      console.error(`[GSC] Property Formats Tried:`);
      propertyCandidates.forEach((f, i) => {
        console.error(`[GSC]   ${i + 1}. "${f}"`);
      });
      console.error(`[GSC] Last Error Status: ${lastErrorStatus || 'unknown'}`);
      console.error(`[GSC] Last Error Message: ${lastErrorMessage || 'none'}`);
      if (googleErrorCode) {
        console.error(`[GSC] Google Error Code: ${googleErrorCode}`);
      }
      if (googleErrorMessage) {
        console.error(`[GSC] Google Error Message: ${googleErrorMessage}`);
      }
      if (googleErrorDetails) {
        console.error(`[GSC] Google Error Details:`, JSON.stringify(googleErrorDetails, null, 2));
      }
      console.error(`[GSC] ========================================`);
      
      // Build comprehensive error message
      let errorMessage = '';
      
      if (lastErrorStatus === 404) {
        errorMessage = `❌ Property Not Found (404)\n\n`;
        errorMessage += `The property could not be found in Google Search Console.\n\n`;
        errorMessage += `Property formats tried:\n   ${triedFormats}\n\n`;
        errorMessage += `Possible causes:\n`;
        errorMessage += `1. The site URL "${siteUrl}" is incorrect\n`;
        errorMessage += `2. The property "${propertyCandidates[0]}" is not verified in Google Search Console\n`;
        errorMessage += `3. The service account "${GSC_SERVICE_ACCOUNT.client_email}" does not have access to this property\n`;
        errorMessage += `4. The property exists but in a different format than we tried\n\n`;
        errorMessage += `To fix this:\n`;
        errorMessage += `- Verify the exact property URL in Google Search Console\n`;
        errorMessage += `- Ensure ${GSC_SERVICE_ACCOUNT.client_email} is added as a user with at least "Full" permissions\n`;
        errorMessage += `- Check if the property is registered as a URL prefix or domain property`;
      } else if (lastErrorStatus === 403) {
        errorMessage = `❌ Access Denied (403)\n\n`;
        errorMessage += `The service account does not have permission to access this property.\n\n`;
        errorMessage += `Service Account: ${GSC_SERVICE_ACCOUNT.client_email}\n`;
        errorMessage += `Property tried: "${lastError?.config?.url || propertyCandidates[0]}"\n\n`;
        errorMessage += `To fix this:\n`;
        errorMessage += `1. Go to Google Search Console → Settings → Users and permissions\n`;
        errorMessage += `2. Add ${GSC_SERVICE_ACCOUNT.client_email} as a user\n`;
        errorMessage += `3. Grant at least "Full" permissions\n`;
        errorMessage += `4. Wait a few minutes for permissions to propagate`;
      } else {
        errorMessage = `❌ Failed to Fetch GSC Queries\n\n`;
        errorMessage += `HTTP Status: ${lastErrorStatus || 'Unknown'}\n`;
        errorMessage += `Error: ${lastErrorMessage || 'Unknown error'}\n\n`;
        if (googleErrorMessage) {
          errorMessage += `Google API Error: ${googleErrorMessage}\n\n`;
        }
        errorMessage += `Property formats tried:\n   ${triedFormats}\n\n`;
        errorMessage += `Service Account: ${GSC_SERVICE_ACCOUNT.client_email}\n`;
        errorMessage += `Original Site URL: ${siteUrl}`;
      }
      
      return res.status(lastErrorStatus || 404).json({
        success: false,
        error: errorMessage,
        errorType: lastErrorStatus === 404 ? 'property_not_found' : lastErrorStatus === 403 ? 'access_denied' : 'api_error',
        details: googleErrorMessage || lastErrorData?.error?.message || lastErrorMessage || 'All property formats failed',
        triedFormats: propertyCandidates,
        triedFormatsCount: propertyCandidates.length,
        lastErrorStatus: lastErrorStatus,
        lastErrorCode: googleErrorCode,
        originalSiteUrl: siteUrl,
        serviceAccountEmail: GSC_SERVICE_ACCOUNT.client_email,
        dateRange: {
          start: startDateStr,
          end: endDateStr
        },
        troubleshooting: {
          step1: `Verify "${siteUrl}" exists in Google Search Console`,
          step2: `Check that ${GSC_SERVICE_ACCOUNT.client_email} has access`,
          step3: `Confirm the exact property format in GSC (URL prefix vs domain)`,
          step4: `Wait a few minutes after adding permissions for propagation`
        },
        fullError: process.env.NODE_ENV === 'development' ? {
          message: lastErrorMessage,
          status: lastErrorStatus,
          code: googleErrorCode,
          data: lastErrorData,
          errors: googleErrorDetails,
          stack: lastError?.stack
        } : undefined
      });
    }
    
    // Check if we got data
    if (!response.data || !response.data.rows) {
      console.log('[GSC] No data returned from API');
      return res.json({
        success: true,
        queries: [],
        message: 'No search queries found for the specified date range',
        property: successfulProperty,
        dateRange: {
          start: startDateStr,
          end: endDateStr
        }
      });
    }
    
    // Transform data to include date range info
    const queries = response.data.rows.map(row => ({
      query: row.keys[0] || '',
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr || 0,
      position: row.position || 0,
      date: `${startDateStr} to ${endDateStr}` // Date range for this query
    }));
    
    console.log(`[GSC] Fetched ${queries.length} queries using property: ${successfulProperty}`);
    
    res.json({
      success: true,
      queries: queries,
      property: successfulProperty,
      propertyFormat: successfulProperty.startsWith('sc-domain:') ? 'domain' : 'url-prefix',
      dateRange: {
        start: startDateStr,
        end: endDateStr
      }
    });
    
  } catch (error) {
    console.error('[GSC] Error fetching queries:', error);
    console.error('[GSC] Error stack:', error.stack);
    console.error('[GSC] Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      response: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      } : null
    });
    
    // Handle specific GSC API errors
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;
      
      if (status === 403) {
        return res.status(403).json({
          success: false,
          error: 'Access denied. Please ensure the service account has access to the GSC property.',
          details: errorData?.error?.message || 'Forbidden',
          fullError: process.env.NODE_ENV === 'development' ? errorData : undefined
        });
      } else if (status === 404) {
        return res.status(404).json({
          success: false,
          error: 'Property not found. Please verify the site URL is correct and the service account has access.',
          details: errorData?.error?.message || 'Not Found',
          fullError: process.env.NODE_ENV === 'development' ? errorData : undefined
        });
      } else {
        return res.status(status).json({
          success: false,
          error: `GSC API error: ${errorData?.error?.message || error.message}`,
          details: errorData?.error || errorData,
          fullError: process.env.NODE_ENV === 'development' ? errorData : undefined
        });
      }
    }
    
    // Handle authentication errors
    if (error.message && error.message.includes('JWT')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication failed. Please check service account credentials.',
        details: error.message
      });
    }
    
    // Handle network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return res.status(503).json({
        success: false,
        error: `Network error: ${error.message}`,
        details: 'Unable to connect to Google Search Console API'
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch GSC queries',
      errorType: error.name || 'UnknownError',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router;





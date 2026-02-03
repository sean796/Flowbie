/**
 * Google Search Console Indexing Routes
 * Handles URL indexing checks, requests, and sitemap processing
 */

const express = require('express');
const { google } = require('googleapis');
const axios = require('axios');
const xml2js = require('xml2js');
const { authenticateGSC } = require('./gsc-auth');
const { findMatchingGSCProperty, generatePropertyCandidates } = require('./gsc-property-utils');

const router = express.Router();

/**
 * Check if a URL is indexed in Google Search Console
 * POST /check-url-indexing
 */
router.post('/check-url-indexing', async (req, res) => {
  console.log('[GSC Routes] POST /check-url-indexing - Request received');
  try {
    const { siteUrl, url } = req.body;
    
    if (!siteUrl || !url) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: siteUrl, url'
      });
    }
    
    console.log(`[GSC Indexing] Checking indexing status for URL: ${url}`);
    
    // Authenticate with full access for URL inspection
    const authClient = await authenticateGSC(true);
    
    // Create Search Console API client (v1 for URL Inspection)
    const searchconsole = google.searchconsole({
      version: 'v1',
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
        console.log(`[GSC Indexing] Found sc-domain property, trying URL prefix format first (like all other sites): "${propertyCandidates[0]}"`);
      } else {
        // Already URL prefix format, use it directly
        propertyCandidates = [exactProperty];
        console.log(`[GSC Indexing] Using URL prefix format from GSC: "${exactProperty}"`);
      }
    } else {
      // Fallback to generating candidates
      propertyCandidates = generatePropertyCandidates(siteUrl);
      console.log(`[GSC Indexing] Property candidates to try:`, propertyCandidates);
    }
    let successfulProperty = null;
    let lastError = null;
    
    // Try each property format
    for (let i = 0; i < propertyCandidates.length; i++) {
      const property = propertyCandidates[i];
      try {
        // Use URL Inspection API to check indexing status
        const response = await searchconsole.urlInspection.index.inspect({
          requestBody: {
            inspectionUrl: url,
            siteUrl: property
          }
        });
        
        successfulProperty = property;
        const inspectionResult = response.data.inspectionResult;
        
        // Check indexing status
        const indexingStatus = inspectionResult?.indexStatusResult?.verdict || 'UNKNOWN';
        const isIndexed = indexingStatus === 'PASS' || indexingStatus === 'PARTIAL';
        
        console.log(`[GSC Indexing] URL ${url} - Indexed: ${isIndexed}, Status: ${indexingStatus}`);
        
        return res.json({
          success: true,
          indexed: isIndexed,
          indexingStatus: indexingStatus,
          coverageState: inspectionResult?.indexStatusResult?.coverageState || null,
          property: successfulProperty
        });
      } catch (error) {
        lastError = error;
        // Continue trying other formats even on 403 - the property might exist in a different format
        if (error.response?.status === 404 || error.response?.status === 403) {
          continue;
        }
      }
    }
    
    // If all property formats failed
    const errorStatus = lastError?.response?.status;
    return res.status(errorStatus || 404).json({
      success: false,
      error: 'Failed to check indexing status. Please verify the site URL and service account permissions.',
      details: lastError?.response?.data?.error?.message || lastError?.message
    });
  } catch (error) {
    console.error('[GSC Indexing] Error checking URL indexing:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to check URL indexing status'
    });
  }
});

/**
 * Request indexing for a URL in Google Search Console
 * POST /request-url-indexing
 */
router.post('/request-url-indexing', async (req, res) => {
  console.log('[GSC Routes] POST /request-url-indexing - Request received');
  try {
    const { siteUrl, url } = req.body;
    
    if (!siteUrl || !url) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: siteUrl, url'
      });
    }
    
    console.log(`[GSC Indexing] Requesting indexing for URL: ${url}`);
    
    // Authenticate with full access for URL inspection
    const authClient = await authenticateGSC(true);
    
    // Create Search Console API client (v1 for URL Inspection)
    const searchconsole = google.searchconsole({
      version: 'v1',
      auth: authClient
    });
    
    // Generate property format candidates
    const propertyCandidates = generatePropertyCandidates(siteUrl);
    let successfulProperty = null;
    let lastError = null;
    
    // Try each property format
    for (const property of propertyCandidates) {
      try {
        // Use URL Inspection API to request indexing
        // Note: The inspect endpoint with siteUrl and inspectionUrl will trigger indexing request
        const response = await searchconsole.urlInspection.index.inspect({
          requestBody: {
            inspectionUrl: url,
            siteUrl: property
          }
        });
        
        successfulProperty = property;
        
        console.log(`[GSC Indexing] Indexing requested for URL: ${url}`);
        
        return res.json({
          success: true,
          requested: true,
          property: successfulProperty,
          message: 'Indexing request submitted successfully'
        });
      } catch (error) {
        lastError = error;
        // If URL is already indexed or request was submitted, that's also success
        if (error.response?.status === 200) {
          successfulProperty = property;
          return res.json({
            success: true,
            requested: true,
            property: successfulProperty,
            message: 'Indexing request processed'
          });
        }
        if (error.response?.status === 404) {
          continue;
        } else if (error.response?.status === 403) {
          break;
        }
      }
    }
    
    // If all property formats failed
    const errorStatus = lastError?.response?.status;
    return res.status(errorStatus || 404).json({
      success: false,
      error: 'Failed to request indexing. Please verify the site URL and service account permissions.',
      details: lastError?.response?.data?.error?.message || lastError?.message
    });
  } catch (error) {
    console.error('[GSC Indexing] Error requesting URL indexing:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to request URL indexing'
    });
  }
});

/**
 * Index all URLs from a sitemap
 * POST /index-sitemap-urls
 */
router.post('/index-sitemap-urls', async (req, res) => {
  console.log('[GSC Routes] POST /index-sitemap-urls - Request received');
  try {
    const { siteUrl, sitemapUrl, username, appPassword } = req.body;
    
    if (!siteUrl || !sitemapUrl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: siteUrl, sitemapUrl'
      });
    }
    
    console.log(`[GSC Indexing] Processing sitemap: ${sitemapUrl}`);
    
    // Parse the sitemap to get URLs
    // Reuse WordPress parse-sitemap logic
    try {
      const config = {
        timeout: 10000,
        validateStatus: (status) => status < 500
      };
      
      // Add auth if provided
      if (username && appPassword) {
        config.auth = {
          username: username,
          password: appPassword
        };
      }
      
      const sitemapResponse = await axios.get(sitemapUrl, config);
      
      if (sitemapResponse.status !== 200) {
        return res.status(sitemapResponse.status).json({
          success: false,
          error: `Failed to fetch sitemap: ${sitemapResponse.status} ${sitemapResponse.statusText}`
        });
      }
      
      const xmlContent = sitemapResponse.data;
      
      if (typeof xmlContent !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Invalid XML content received'
        });
      }
      
      // Parse XML
      const parser = new xml2js.Parser({
        explicitArray: false,
        mergeAttrs: true
      });
      
      const result = await parser.parseStringPromise(xmlContent);
      
      let urlsToProcess = [];
      
      // Extract URLs based on sitemap type
      if (result.sitemapindex) {
        // Sitemap index - we only process the specific sitemap URL, not nested ones
        return res.status(400).json({
          success: false,
          error: 'This sitemap is an index (contains other sitemaps). Please process individual child sitemaps instead.',
          sitemapType: 'index'
        });
      } else if (result.urlset) {
        // URL set - extract page URLs
        const urls = result.urlset.url;
        urlsToProcess = Array.isArray(urls)
          ? urls.map(u => u.loc).filter(Boolean)
          : urls?.loc ? [urls.loc] : [];
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid sitemap format. Expected sitemapindex or urlset.'
        });
      }
      
      if (urlsToProcess.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No URLs found in sitemap'
        });
      }
      
      console.log(`[GSC Indexing] Found ${urlsToProcess.length} URLs to process`);
      
      // Authenticate with full access
      const authClient = await authenticateGSC(true);
      const searchconsole = google.searchconsole({
        version: 'v1',
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
          console.log(`[GSC Indexing] Found sc-domain property, trying URL prefix format first (like all other sites): "${propertyCandidates[0]}"`);
        } else {
          // Already URL prefix format, use it directly
          propertyCandidates = [exactProperty];
          console.log(`[GSC Indexing] Using URL prefix format from GSC: "${exactProperty}"`);
        }
      } else {
        // Fallback to generating candidates
        propertyCandidates = generatePropertyCandidates(siteUrl);
        console.log(`[GSC Indexing] Property candidates to try:`, propertyCandidates);
      }
      let successfulProperty = null;
      
      // Try to find a working property format
      for (let i = 0; i < propertyCandidates.length; i++) {
        const property = propertyCandidates[i];
        try {
          // Test with first URL
          await searchconsole.urlInspection.index.inspect({
            requestBody: {
              inspectionUrl: urlsToProcess[0],
              siteUrl: property
            }
          });
          successfulProperty = property;
          break;
        } catch (error) {
          // Continue trying other formats even on 403 - the property might exist in a different format
          if (error.response?.status === 404 || error.response?.status === 403) {
            continue;
          }
        }
      }
      
      if (!successfulProperty) {
        return res.status(404).json({
          success: false,
          error: 'Failed to find valid GSC property. Please verify the site URL and service account permissions.'
        });
      }
      
      // Process URLs with rate limiting
      const results = [];
      let processed = 0;
      let indexed = 0;
      let requested = 0;
      let errors = 0;
      const delayBetweenRequests = 150; // ms - rate limiting
      
      for (const url of urlsToProcess) {
        try {
          processed++;
          
          // Check if indexed
          const checkResponse = await searchconsole.urlInspection.index.inspect({
            requestBody: {
              inspectionUrl: url,
              siteUrl: successfulProperty
            }
          });
          
          const inspectionResult = checkResponse.data.inspectionResult;
          const indexingStatus = inspectionResult?.indexStatusResult?.verdict || 'UNKNOWN';
          const isIndexed = indexingStatus === 'PASS' || indexingStatus === 'PARTIAL';
          
          if (isIndexed) {
            indexed++;
            results.push({ url, status: 'indexed', indexingStatus });
            console.log(`[GSC Indexing] [${processed}/${urlsToProcess.length}] ${url} - Already indexed`);
          } else {
            // Request indexing
            // The inspect call also triggers indexing request for non-indexed URLs
            requested++;
            results.push({ url, status: 'requested', indexingStatus });
            console.log(`[GSC Indexing] [${processed}/${urlsToProcess.length}] ${url} - Indexing requested`);
          }
          
          // Rate limiting - delay between requests
          if (processed < urlsToProcess.length) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
          }
        } catch (error) {
          errors++;
          const errorMsg = error.response?.data?.error?.message || error.message || 'Unknown error';
          results.push({ url, status: 'error', error: errorMsg });
          console.error(`[GSC Indexing] [${processed}/${urlsToProcess.length}] ${url} - Error: ${errorMsg}`);
          
          // Continue processing other URLs even if one fails
        }
      }
      
      console.log(`[GSC Indexing] Completed: Processed: ${processed}, Indexed: ${indexed}, Requested: ${requested}, Errors: ${errors}`);
      
      return res.json({
        success: true,
        processed: processed,
        indexed: indexed,
        requested: requested,
        errors: errors,
        total: urlsToProcess.length,
        results: results,
        property: successfulProperty
      });
      
    } catch (sitemapError) {
      console.error('[GSC Indexing] Error parsing sitemap:', sitemapError);
      return res.status(500).json({
        success: false,
        error: `Failed to parse sitemap: ${sitemapError.message || 'Unknown error'}`,
        details: sitemapError.response?.data || sitemapError.message
      });
    }
  } catch (error) {
    console.error('[GSC Indexing] Error indexing sitemap URLs:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to index sitemap URLs'
    });
  }
});

module.exports = router;





/**
 * Google Search Console Performance Routes
 * Handles fetching performance stats and page-specific performance data
 */

const express = require('express');
const { google } = require('googleapis');
const { authenticateGSC } = require('./gsc-auth');
const { gscPropertyErrorPayload } = require('./gsc-config');
const { findMatchingGSCProperty, generatePropertyCandidates } = require('./gsc-property-utils');
const { validateDates } = require('./gsc-validation');

const router = express.Router();

/**
 * Helper function to fetch GSC performance stats for a date range
 * Uses no-dimensions query for accurate site-wide totals (clicks, impressions).
 * Query-dimension call provides search terms count and top keywords only.
 */
async function fetchGSCPerformanceStats(webmasters, property, startDate, endDate) {
  const stats = {
    clicks: 0,
    impressions: 0,
    ctr: 0,
    avgPosition: 0,
    pagesCount: 0,
    searchTermsCount: 0,
    queries: []
  };

  // Fetch accurate site-wide totals (no dimensions = single row with true totals)
  const totalsResponse = await webmasters.searchanalytics.query({
    siteUrl: property,
    requestBody: {
      startDate: startDate,
      endDate: endDate
    }
  });

  if (totalsResponse.data?.rows?.[0]) {
    const row = totalsResponse.data.rows[0];
    stats.clicks = row.clicks || 0;
    stats.impressions = row.impressions || 0;
    stats.ctr = row.ctr || 0;
    stats.avgPosition = row.position || 0;
  }

  // Fetch queries data (for search terms count and top keywords only)
  try {
    const queriesResponse = await webmasters.searchanalytics.query({
      siteUrl: property,
      requestBody: {
        startDate: startDate,
        endDate: endDate,
        dimensions: ['query'],
        rowLimit: 10000,
        startRow: 0
      }
    });

    if (queriesResponse.data && queriesResponse.data.rows) {
      stats.searchTermsCount = queriesResponse.data.rows.length;
      stats.queries = queriesResponse.data.rows.map(row => ({
        query: row.keys[0] || '',
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
        ctr: row.ctr || 0,
        position: row.position || 0
      }));
    }
  } catch (error) {
    console.error('[GSC Performance] Error fetching queries:', error);
    throw error;
  }

  // Fetch pages data (for pages count)
  try {
    const pagesResponse = await webmasters.searchanalytics.query({
      siteUrl: property,
      requestBody: {
        startDate: startDate,
        endDate: endDate,
        dimensions: ['page'],
        rowLimit: 10000,
        startRow: 0
      }
    });

    if (pagesResponse.data && pagesResponse.data.rows) {
      stats.pagesCount = pagesResponse.data.rows.length;
    }
  } catch (error) {
    console.warn('[GSC Performance] Error fetching pages (non-fatal):', error.message);
    // Non-fatal - continue without pages count
  }

  return stats;
}

/**
 * Fetch GSC Performance Stats for report generation
 * POST /fetch-performance-stats
 */
router.post('/fetch-performance-stats', async (req, res) => {
  console.log('[GSC Routes] POST /fetch-performance-stats - Request received');
  try {
    const { siteUrl, startDate, endDate, compareStartDate, compareEndDate } = req.body;
    
    // Validate required fields
    if (!siteUrl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: siteUrl'
      });
    }

    if (!startDate || !endDate || !compareStartDate || !compareEndDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required date fields: startDate, endDate, compareStartDate, compareEndDate'
      });
    }

    // Validate date ranges
    const currentValidation = validateDates(startDate, endDate);
    if (!currentValidation.valid) {
      return res.status(400).json({
        success: false,
        error: `Current period: ${currentValidation.error || 'Invalid date range'}`
      });
    }

    const compareValidation = validateDates(compareStartDate, compareEndDate);
    if (!compareValidation.valid) {
      return res.status(400).json({
        success: false,
        error: `Comparison period: ${compareValidation.error || 'Invalid date range'}`
      });
    }

    const startDateStr = currentValidation.startDateStr;
    const endDateStr = currentValidation.endDateStr;
    const compareStartDateStr = compareValidation.startDateStr;
    const compareEndDateStr = compareValidation.endDateStr;

    const { writeReportDateRange } = require('./report-date-range-writer');
    writeReportDateRange({ startDate: startDateStr, endDate: endDateStr, compareStartDate: compareStartDateStr, compareEndDate: compareEndDateStr });

    console.log(`[GSC Performance] Fetching stats for ${siteUrl}`);
    console.log(`[GSC Performance] Current: ${startDateStr} to ${endDateStr}`);
    console.log(`[GSC Performance] Comparison: ${compareStartDateStr} to ${compareEndDateStr}`);

    // Authenticate with service account
    const authClient = await authenticateGSC(false);
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
        console.log(`[GSC Performance] Found sc-domain property, trying URL prefix format first (like all other sites): "${propertyCandidates[0]}"`);
      } else {
        // Already URL prefix format, use it directly
        propertyCandidates = [exactProperty];
        console.log(`[GSC Performance] Using URL prefix format from GSC: "${exactProperty}"`);
      }
    } else {
      // Fallback to generating candidates
      propertyCandidates = generatePropertyCandidates(siteUrl);
      console.log(`[GSC Performance] Property candidates to try:`, propertyCandidates);
    }
    // #region agent log
    fetch('http://127.0.0.1:7252/ingest/bab6957c-2bf9-434e-a543-29f3beb37d51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gsc-performance.js:670',message:'Property candidates for performance stats',data:{siteUrl,exactProperty,propertyCandidates,candidatesCount:propertyCandidates.length},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'G'})}).catch(()=>{});
    // #endregion
    let successfulProperty = null;
    let lastError = null;

    // Try each property format
    for (let i = 0; i < propertyCandidates.length; i++) {
      const property = propertyCandidates[i];
      const isLastAttempt = i === propertyCandidates.length - 1;
      // #region agent log
      fetch('http://127.0.0.1:7252/ingest/bab6957c-2bf9-434e-a543-29f3beb37d51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gsc-performance.js:631',message:'Trying property format',data:{attempt:i+1,total:propertyCandidates.length,property,siteUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      try {
        // Test with a simple query
        // #region agent log
        fetch('http://127.0.0.1:7252/ingest/bab6957c-2bf9-434e-a543-29f3beb37d51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gsc-performance.js:636',message:'Before API call',data:{property,startDate:startDateStr,endDate:endDateStr},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        await webmasters.searchanalytics.query({
          siteUrl: property,
          requestBody: {
            startDate: startDateStr,
            endDate: endDateStr,
            dimensions: ['query'],
            rowLimit: 1
          }
        });
        // #region agent log
        fetch('http://127.0.0.1:7252/ingest/bab6957c-2bf9-434e-a543-29f3beb37d51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gsc-performance.js:642',message:'Property format succeeded',data:{property,successfulProperty:property},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        successfulProperty = property;
        break;
      } catch (error) {
        lastError = error;
        const errorStatus = error.response?.status;
        const errorMessage = error.response?.data?.error?.message || error.message;
        // #region agent log
        fetch('http://127.0.0.1:7252/ingest/bab6957c-2bf9-434e-a543-29f3beb37d51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gsc-performance.js:648',message:'Property format failed',data:{property,errorStatus,errorMessage,errorCode:error.code,is404:errorStatus===404,is403:errorStatus===403,willContinue:true,willBreak:false},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        // Continue trying other formats even on 403 - the property might exist in a different format
        // Only stop if we've exhausted all candidates
        if (errorStatus === 404 || errorStatus === 403) {
          // #region agent log
          fetch('http://127.0.0.1:7252/ingest/bab6957c-2bf9-434e-a543-29f3beb37d51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gsc-performance.js:655',message:'403/404 error - continuing to next format',data:{property,errorStatus,remainingCandidates:propertyCandidates.length-i-1,isLastAttempt},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
          continue;
        }
      }
    }

    if (!successfulProperty) {
      const errorStatus = lastError?.response?.status;
      const lastErrorMessage = lastError?.response?.data?.error?.message || lastError?.message;
      // #region agent log
      fetch('http://127.0.0.1:7252/ingest/bab6957c-2bf9-434e-a543-29f3beb37d51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gsc-performance.js:660',message:'All property formats failed',data:{siteUrl,propertyCandidates,errorStatus,lastErrorMessage,triedCount:propertyCandidates.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      return res.status(errorStatus || 404).json(gscPropertyErrorPayload());
    }

    // Fetch stats for both periods
    const [currentStats, comparisonStats] = await Promise.all([
      fetchGSCPerformanceStats(webmasters, successfulProperty, startDateStr, endDateStr),
      fetchGSCPerformanceStats(webmasters, successfulProperty, compareStartDateStr, compareEndDateStr)
    ]);

    // Calculate comparisons
    const comparisons = {
      clicksChange: currentStats.clicks - comparisonStats.clicks,
      clicksChangePercent: comparisonStats.clicks > 0 
        ? ((currentStats.clicks - comparisonStats.clicks) / comparisonStats.clicks) * 100 
        : (currentStats.clicks > 0 ? 100 : 0),
      impressionsChange: currentStats.impressions - comparisonStats.impressions,
      impressionsChangePercent: comparisonStats.impressions > 0
        ? ((currentStats.impressions - comparisonStats.impressions) / comparisonStats.impressions) * 100
        : (currentStats.impressions > 0 ? 100 : 0),
      ctrChange: currentStats.ctr - comparisonStats.ctr,
      ctrChangePercent: comparisonStats.ctr > 0
        ? ((currentStats.ctr - comparisonStats.ctr) / comparisonStats.ctr) * 100
        : (currentStats.ctr > 0 ? 100 : 0),
      avgPositionChange: currentStats.avgPosition - comparisonStats.avgPosition,
      avgPositionChangePercent: comparisonStats.avgPosition > 0
        ? ((currentStats.avgPosition - comparisonStats.avgPosition) / comparisonStats.avgPosition) * 100
        : 0,
      pagesChange: currentStats.pagesCount - comparisonStats.pagesCount,
      pagesChangePercent: comparisonStats.pagesCount > 0
        ? ((currentStats.pagesCount - comparisonStats.pagesCount) / comparisonStats.pagesCount) * 100
        : (currentStats.pagesCount > 0 ? 100 : 0),
      searchTermsChange: currentStats.searchTermsCount - comparisonStats.searchTermsCount,
      searchTermsChangePercent: comparisonStats.searchTermsCount > 0
        ? ((currentStats.searchTermsCount - comparisonStats.searchTermsCount) / comparisonStats.searchTermsCount) * 100
        : (currentStats.searchTermsCount > 0 ? 100 : 0)
    };

    // Find top keywords with ranking changes (compare queries from both periods)
    const currentQueryMap = new Map();
    currentStats.queries.forEach(q => {
      currentQueryMap.set(q.query.toLowerCase(), q);
    });

    const comparisonQueryMap = new Map();
    comparisonStats.queries.forEach(q => {
      comparisonQueryMap.set(q.query.toLowerCase(), q);
    });

    const topKeywords = [];
    const processedQueries = new Set();

    // Process queries that appear in both periods or just in current
    [...currentQueryMap.keys(), ...comparisonQueryMap.keys()].forEach(queryKey => {
      if (processedQueries.has(queryKey)) return;
      processedQueries.add(queryKey);

      const current = currentQueryMap.get(queryKey);
      const previous = comparisonQueryMap.get(queryKey);

      if (current && previous) {
        // Query exists in both periods - calculate changes
        const rankingChange = previous.position - current.position; // Negative means improved
        if (Math.abs(rankingChange) >= 1 || current.clicks > 0 || current.impressions > 20) {
          topKeywords.push({
            query: current.query,
            currentRanking: current.position,
            previousRanking: previous.position,
            rankingChange: rankingChange,
            currentClicks: current.clicks,
            previousClicks: previous.clicks,
            clicksChange: current.clicks - previous.clicks,
            currentImpressions: current.impressions,
            previousImpressions: previous.impressions,
            impressionsChange: current.impressions - previous.impressions
          });
        }
      } else if (current && current.impressions > 10) {
        // New query in current period
        topKeywords.push({
          query: current.query,
          currentRanking: current.position,
          previousRanking: 0,
          rankingChange: 0,
          currentClicks: current.clicks,
          previousClicks: 0,
          clicksChange: current.clicks,
          currentImpressions: current.impressions,
          previousImpressions: 0,
          impressionsChange: current.impressions
        });
      }
    });

    // Sort by ranking improvement (most negative = biggest improvement) and impressions
    topKeywords.sort((a, b) => {
      if (Math.abs(a.rankingChange) !== Math.abs(b.rankingChange)) {
        return Math.abs(a.rankingChange) - Math.abs(b.rankingChange); // Biggest improvements first
      }
      return b.currentImpressions - a.currentImpressions; // Then by impressions
    });

    // Take top 20
    const topKeywordsFinal = topKeywords.slice(0, 20);

    const response = {
      success: true,
      stats: {
        currentPeriod: {
          startDate: startDateStr,
          endDate: endDateStr,
          clicks: currentStats.clicks,
          impressions: currentStats.impressions,
          ctr: currentStats.ctr,
          avgPosition: currentStats.avgPosition,
          pagesCount: currentStats.pagesCount,
          searchTermsCount: currentStats.searchTermsCount
        },
        comparisonPeriod: {
          startDate: compareStartDateStr,
          endDate: compareEndDateStr,
          clicks: comparisonStats.clicks,
          impressions: comparisonStats.impressions,
          ctr: comparisonStats.ctr,
          avgPosition: comparisonStats.avgPosition,
          pagesCount: comparisonStats.pagesCount,
          searchTermsCount: comparisonStats.searchTermsCount
        },
        comparisons: comparisons,
        topKeywords: topKeywordsFinal
      },
      property: successfulProperty
    };

    console.log(`[GSC Performance] Successfully fetched stats for ${startDateStr} to ${endDateStr}: ${currentStats.impressions} impressions, ${currentStats.clicks} clicks. Top keywords: ${topKeywordsFinal.length}`);
    res.json(response);

  } catch (error) {
    console.error('[GSC Performance] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch GSC performance stats'
    });
  }
});

/**
 * Fetch GSC Performance Stats for a specific page URL
 * POST /fetch-page-performance
 */
router.post('/fetch-page-performance', async (req, res) => {
  console.log('[GSC Routes] POST /fetch-page-performance - Request received');
  try {
    const { siteUrl, pageUrl, startDate, endDate } = req.body;
    
    // Validate required fields
    if (!siteUrl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: siteUrl'
      });
    }
    
    if (!pageUrl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: pageUrl'
      });
    }
    
    // Set default date range (last 3 months) if not provided
    const today = new Date();
    const defaultEndDate = new Date(today);
    defaultEndDate.setDate(today.getDate() - 3); // GSC data has 3-day delay
    
    const defaultStartDate = new Date(defaultEndDate);
    defaultStartDate.setMonth(defaultStartDate.getMonth() - 3);
    
    const endDateToUse = endDate || defaultEndDate.toISOString().split('T')[0];
    const startDateToUse = startDate || defaultStartDate.toISOString().split('T')[0];
    
    // Validate dates
    const dateValidation = validateDates(startDateToUse, endDateToUse);
    if (!dateValidation.valid) {
      return res.status(400).json({
        success: false,
        error: dateValidation.error || 'Invalid date range'
      });
    }
    
    const startDateStr = dateValidation.startDateStr;
    const endDateStr = dateValidation.endDateStr;
    
    console.log(`[GSC Page Performance] Fetching stats for page: ${pageUrl}`);
    console.log(`[GSC Page Performance] Site: ${siteUrl}`);
    console.log(`[GSC Page Performance] Date range: ${startDateStr} to ${endDateStr}`);
    
    // Authenticate with service account
    const authClient = await authenticateGSC(false);
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
        console.log(`[GSC Page Performance] Found sc-domain property, trying URL prefix format first (like all other sites): "${propertyCandidates[0]}"`);
      } else {
        // Already URL prefix format, use it directly
        propertyCandidates = [exactProperty];
        console.log(`[GSC Page Performance] Using URL prefix format from GSC: "${exactProperty}"`);
      }
    } else {
      // Fallback to generating candidates
      propertyCandidates = generatePropertyCandidates(siteUrl);
      console.log(`[GSC Page Performance] Property candidates to try:`, propertyCandidates);
    }
    // #region agent log
    fetch('http://127.0.0.1:7252/ingest/bab6957c-2bf9-434e-a543-29f3beb37d51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gsc-performance.js:908',message:'Property candidates for page performance',data:{siteUrl,exactProperty,propertyCandidates,candidatesCount:propertyCandidates.length},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'G'})}).catch(()=>{});
    // #endregion
    let successfulProperty = null;
    let lastError = null;
    
    // Try each property format
    for (let i = 0; i < propertyCandidates.length; i++) {
      const property = propertyCandidates[i];
      const isLastAttempt = i === propertyCandidates.length - 1;
      // #region agent log
      fetch('http://127.0.0.1:7252/ingest/bab6957c-2bf9-434e-a543-29f3beb37d51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gsc-performance.js:869',message:'Trying property format (page performance)',data:{attempt:i+1,total:propertyCandidates.length,property,siteUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      try {
        // Test with a simple query
        // #region agent log
        fetch('http://127.0.0.1:7252/ingest/bab6957c-2bf9-434e-a543-29f3beb37d51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gsc-performance.js:874',message:'Before API call (page performance)',data:{property,startDate:startDateStr,endDate:endDateStr},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        await webmasters.searchanalytics.query({
          siteUrl: property,
          requestBody: {
            startDate: startDateStr,
            endDate: endDateStr,
            dimensions: ['page'],
            rowLimit: 1
          }
        });
        // #region agent log
        fetch('http://127.0.0.1:7252/ingest/bab6957c-2bf9-434e-a543-29f3beb37d51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gsc-performance.js:880',message:'Property format succeeded (page performance)',data:{property,successfulProperty:property},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        successfulProperty = property;
        break;
      } catch (error) {
        lastError = error;
        const errorStatus = error.response?.status;
        const errorMessage = error.response?.data?.error?.message || error.message;
        // #region agent log
        fetch('http://127.0.0.1:7252/ingest/bab6957c-2bf9-434e-a543-29f3beb37d51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gsc-performance.js:888',message:'Property format failed (page performance)',data:{property,errorStatus,errorMessage,errorCode:error.code,is404:errorStatus===404,is403:errorStatus===403,willContinue:true,willBreak:false,isLastAttempt},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        // Continue trying other formats even on 403 - the property might exist in a different format
        // Only stop if we've exhausted all candidates
        if (errorStatus === 404 || errorStatus === 403) {
          // #region agent log
          fetch('http://127.0.0.1:7252/ingest/bab6957c-2bf9-434e-a543-29f3beb37d51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gsc-performance.js:895',message:'403/404 error - continuing to next format (page performance)',data:{property,errorStatus,remainingCandidates:propertyCandidates.length-i-1,isLastAttempt},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
          continue;
        }
      }
    }
    
    if (!successfulProperty) {
      const errorStatus = lastError?.response?.status;
      const lastErrorMessage = lastError?.response?.data?.error?.message || lastError?.message;
      // #region agent log
      fetch('http://127.0.0.1:7252/ingest/bab6957c-2bf9-434e-a543-29f3beb37d51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gsc-performance.js:900',message:'All property formats failed (page performance)',data:{siteUrl,propertyCandidates,errorStatus,lastErrorMessage,triedCount:propertyCandidates.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      return res.status(errorStatus || 404).json(gscPropertyErrorPayload());
    }
    
    // Step 1: Fetch ALL pages from GSC to see what format they're stored in
    // This is more reliable than guessing URL variations
    console.log(`[GSC Page Performance] Step 1: Fetching all pages from GSC to match URL format...`);
    
    let allPages = [];
    let pageExists = false;
    let matchedUrl = null;
    let pageStats = null;
    
    try {
      // Fetch all pages (up to 25000 which is the max)
      const allPagesResponse = await webmasters.searchanalytics.query({
        siteUrl: successfulProperty,
        requestBody: {
          startDate: startDateStr,
          endDate: endDateStr,
          dimensions: ['page'],
          rowLimit: 25000
        }
      });
      
      if (allPagesResponse.data && allPagesResponse.data.rows) {
        allPages = allPagesResponse.data.rows.map(row => ({
          url: row.keys[0], // First key is the page URL
          clicks: row.clicks || 0,
          impressions: row.impressions || 0,
          ctr: row.ctr || 0,
          position: row.position || 0
        }));
        
        console.log(`[GSC Page Performance] Found ${allPages.length} total pages in GSC`);
        if (allPages.length > 0) {
          console.log(`[GSC Page Performance] Sample page URLs from GSC:`, allPages.slice(0, 5).map(p => p.url));
        }
        
        // Normalize input URL for matching (multiple formats)
        const inputUrlNormalized = pageUrl.trim();
        const inputUrlWithoutProtocol = inputUrlNormalized.replace(/^https?:\/\//, '');
        const inputUrlWithoutSlash = inputUrlWithoutProtocol.replace(/\/$/, '');
        const inputUrlWithSlash = inputUrlWithoutSlash + '/';
        const inputUrlLeadingSlash = '/' + inputUrlWithoutProtocol;
        
        const inputVariations = [
          inputUrlNormalized,
          inputUrlWithoutProtocol,
          inputUrlWithoutSlash,
          inputUrlWithSlash,
          inputUrlLeadingSlash,
          inputUrlNormalized.replace(/\/$/, ''),
          inputUrlNormalized + '/'
        ].filter((v, i, arr) => arr.indexOf(v) === i); // Remove duplicates
        
        console.log(`[GSC Page Performance] Input URL: ${inputUrlNormalized}`);
        console.log(`[GSC Page Performance] Trying to match against ${allPages.length} pages in GSC...`);
        
        // Try to find exact or fuzzy match
        for (const inputVar of inputVariations) {
          // Exact match
          const exactMatch = allPages.find(p => {
            const gscUrl = p.url;
            return gscUrl === inputVar || 
                   gscUrl === '/' + inputVar ||
                   gscUrl === inputVar + '/' ||
                   gscUrl.replace(/\/$/, '') === inputVar.replace(/\/$/, '') ||
                   gscUrl.replace(/^\/?/, '') === inputVar.replace(/^\/?/, '') ||
                   gscUrl.replace(/\/$/, '').replace(/^\/?/, '') === inputVar.replace(/\/$/, '').replace(/^\/?/, '');
          });
          
          if (exactMatch) {
            pageStats = {
              clicks: exactMatch.clicks,
              impressions: exactMatch.impressions,
              ctr: exactMatch.ctr,
              position: exactMatch.position
            };
            pageExists = true;
            matchedUrl = exactMatch.url;
            console.log(`[GSC Page Performance] ✅ Exact match found! GSC URL: ${matchedUrl}, Clicks: ${pageStats.clicks}, Impressions: ${pageStats.impressions}`);
            break;
          }
        }
        
        // If no exact match, try fuzzy matching (normalize both URLs)
        if (!pageExists) {
          const normalizeForMatch = (url) => {
            return url
              .toLowerCase()
              .replace(/^https?:\/\//, '')
              .replace(/^www\./, '')
              .replace(/\/$/, '')
              .replace(/^\/+/, '');
          };
          
          const normalizedInput = normalizeForMatch(inputUrlNormalized);
          
          for (const page of allPages) {
            const normalizedGscUrl = normalizeForMatch(page.url);
            if (normalizedGscUrl === normalizedInput || 
                normalizedGscUrl.endsWith(normalizedInput) ||
                normalizedInput.endsWith(normalizedGscUrl)) {
              pageStats = {
                clicks: page.clicks,
                impressions: page.impressions,
                ctr: page.ctr,
                position: page.position
              };
              pageExists = true;
              matchedUrl = page.url;
              console.log(`[GSC Page Performance] ✅ Fuzzy match found! GSC URL: ${matchedUrl}, Input: ${inputUrlNormalized}`);
              console.log(`[GSC Page Performance] Stats: Clicks: ${pageStats.clicks}, Impressions: ${pageStats.impressions}`);
              break;
            }
          }
        }
      }
    } catch (error) {
      console.error(`[GSC Page Performance] Error fetching all pages:`, error.message);
      // Fall back to the old method if fetching all pages fails
      console.log(`[GSC Page Performance] Falling back to direct URL matching...`);
    }
    
    // Step 2: If page exists, fetch queries using the matched URL format
    let pageQueries = [];
    
    if (pageExists && matchedUrl) {
      console.log(`[GSC Page Performance] Step 2: Fetching queries for matched URL: ${matchedUrl}`);
      try {
        const queryResponse = await webmasters.searchanalytics.query({
          siteUrl: successfulProperty,
          requestBody: {
            startDate: startDateStr,
            endDate: endDateStr,
            dimensions: ['page', 'query'],
            dimensionFilterGroups: [{
              filters: [{
                dimension: 'page',
                operator: 'equals',
                expression: matchedUrl
              }]
            }],
            rowLimit: 25000 // Maximum allowed
          }
        });
        
        if (queryResponse.data && queryResponse.data.rows) {
          // Extract queries from this URL match
          // When dimensions are ['page', 'query'], keys[0] = page URL, keys[1] = query
          pageQueries = queryResponse.data.rows
            .map(row => ({
              query: (row.keys && row.keys[1]) ? row.keys[1].trim() : '', // Second key is the query
              clicks: row.clicks || 0,
              impressions: row.impressions || 0,
              ctr: row.ctr || 0,
              position: row.position || 0
            }))
            .filter(q => q.query && q.query.length > 0 && (q.clicks > 0 || q.impressions > 0)); // Filter out empty queries and queries with no data
          
          console.log(`[GSC Page Performance] Found ${pageQueries.length} valid queries for URL: ${matchedUrl} (after filtering empty queries)`);
          
          // Log top 5 queries before sorting for debugging
          if (pageQueries.length > 0) {
            const top5BeforeSort = pageQueries.slice(0, 5).map(q => ({
              query: q.query,
              clicks: q.clicks,
              impressions: q.impressions
            }));
            console.log(`[GSC Page Performance] Top 5 queries BEFORE sorting:`, top5BeforeSort);
          } else {
            console.warn(`[GSC Page Performance] ⚠️ No valid queries found after filtering (had ${queryResponse.data.rows.length} total rows)`);
          }
        } else {
          console.log(`[GSC Page Performance] No queries found for URL: ${matchedUrl} (page exists but no query data)`);
        }
      } catch (error) {
        console.error(`[GSC Page Performance] Error fetching queries for ${matchedUrl}:`, error.message);
        // Even if query fetch fails, we know the page exists, so continue with empty queries
      }
    } else {
      console.warn(`[GSC Page Performance] ❌ Page not found in GSC. Searched ${allPages.length} pages.`);
      console.warn(`[GSC Page Performance] Input URL: ${pageUrl}`);
      if (allPages.length > 0) {
        console.warn(`[GSC Page Performance] Sample GSC URLs (first 10):`, allPages.slice(0, 10).map(p => p.url));
      }
    }
    
    // Sort queries by priority:
    // 1. If any queries have clicks > 0: sort by clicks (descending), then impressions (descending)
    // 2. If all queries have 0 clicks: sort by impressions (descending) only
    const hasAnyClicks = pageQueries.some(q => q.clicks > 0);
    
    if (hasAnyClicks) {
      // Prioritize queries with clicks - sort by clicks first, then impressions
      pageQueries.sort((a, b) => {
        if (b.clicks !== a.clicks) {
          return b.clicks - a.clicks; // More clicks = higher priority
        }
        return b.impressions - a.impressions; // Tie-breaker: more impressions
      });
      console.log(`[GSC Page Performance] Sorting by clicks (${pageQueries.length} queries with clicks > 0)`);
    } else {
      // No clicks - sort by impressions only
      pageQueries.sort((a, b) => b.impressions - a.impressions);
      console.log(`[GSC Page Performance] No clicks found - sorting by impressions only`);
    }
    
    // CRITICAL: Only select keywords from actual GSC query data
    // NO FALLBACKS, NO GUESSING, NO PAGE-LEVEL AGGREGATES
    if (pageQueries.length === 0) {
      console.error(`[GSC Page Performance] ❌ HARD FAIL: No valid GSC queries found for page ${pageUrl}`);
      console.error(`[GSC Page Performance] Page exists in GSC but has no query-level data in date range ${startDateStr} to ${endDateStr}`);
      return res.status(400).json({
        success: false,
        error: 'No valid search queries found for this page in Google Search Console. The page may not have received any search traffic in the selected date range.',
        pageExists: pageExists,
        pageStats: pageStats,
        dateRange: {
          startDate: startDateStr,
          endDate: endDateStr
        },
        property: successfulProperty
      });
    }
    
    // Validate that we have a valid query after sorting
    const topKeyword = pageQueries[0];
    if (!topKeyword || !topKeyword.query || topKeyword.query.trim().length === 0) {
      console.error(`[GSC Page Performance] ❌ HARD FAIL: Top keyword is invalid after sorting`);
      console.error(`[GSC Page Performance] Top keyword object:`, topKeyword);
      return res.status(500).json({
        success: false,
        error: 'Invalid keyword data returned from GSC. Please try again or contact support.',
        queriesCount: pageQueries.length
      });
    }
    
    // Validate that the selected keyword actually exists in our queries array
    const keywordExists = pageQueries.some(q => q.query === topKeyword.query);
    if (!keywordExists) {
      console.error(`[GSC Page Performance] ❌ HARD FAIL: Selected keyword "${topKeyword.query}" not found in pageQueries array`);
      return res.status(500).json({
        success: false,
        error: 'Keyword selection validation failed. Selected keyword does not match GSC query data.',
        selectedKeyword: topKeyword.query,
        queriesCount: pageQueries.length
      });
    }
    
    // Log the selection criteria used and top queries after sorting
    const selectionReason = hasAnyClicks 
      ? `most clicks (${topKeyword.clicks} clicks, ${topKeyword.impressions} impressions)`
      : `most impressions (${topKeyword.impressions} impressions, 0 clicks)`;
    console.log(`[GSC Page Performance] ✅ Selected top keyword "${topKeyword.query}" based on: ${selectionReason}`);
    console.log(`[GSC Page Performance] ✅ Validation passed: Keyword exists in GSC query data`);
    
    // Log top 10 queries AFTER sorting for debugging
    const top10AfterSort = pageQueries.slice(0, 10).map(q => ({
      query: q.query,
      clicks: q.clicks,
      impressions: q.impressions
    }));
    console.log(`[GSC Page Performance] Top 10 queries AFTER sorting:`, top10AfterSort);
    
    // Note: We no longer use page-level stats as fallback - we require actual query data
    
    const response = {
      success: true,
      pageUrl: pageUrl,
      matchedUrl: matchedUrl,
      pageExists: pageExists,
      pageStats: pageStats,
      dateRange: {
        startDate: startDateStr,
        endDate: endDateStr
      },
      queries: pageQueries,
      topKeyword: topKeyword ? {
        query: topKeyword.query,
        clicks: topKeyword.clicks,
        impressions: topKeyword.impressions,
        ctr: topKeyword.ctr,
        position: topKeyword.position
      } : null,
      totalQueries: pageQueries.length,
      property: successfulProperty
    };
    
    // Log final result (only if we got here, meaning we have valid queries)
    console.log(`[GSC Page Performance] ✅ Successfully fetched ${pageQueries.length} queries. Top keyword: ${topKeyword.query}`);
    
    res.json(response);
    
  } catch (error) {
    console.error('[GSC Page Performance] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch GSC page performance stats'
    });
  }
});

/**
 * Fetch historical GSC stats (all-time from earliest available data)
 * POST /fetch-historical-stats
 */
router.post('/fetch-historical-stats', async (req, res) => {
  console.log('[GSC Routes] POST /fetch-historical-stats - Request received');
  try {
    const { siteUrl } = req.body;
    
    if (!siteUrl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: siteUrl'
      });
    }

    console.log(`[GSC Historical] Fetching all-time stats for ${siteUrl}`);

    // Authenticate with service account
    const authClient = await authenticateGSC(false);
    const webmasters = google.webmasters({
      version: 'v3',
      auth: authClient
    });

    // Find the correct property format
    const exactProperty = await findMatchingGSCProperty(siteUrl);
    let propertyCandidates = [];
    
    if (exactProperty) {
      if (exactProperty.startsWith('sc-domain:')) {
        const domain = exactProperty.replace(/^sc-domain:/, '');
        propertyCandidates = [
          `https://${domain}/`,
          `https://${domain}`,
          exactProperty
        ];
      } else {
        propertyCandidates = [exactProperty];
      }
    } else {
      propertyCandidates = generatePropertyCandidates(siteUrl);
    }

    let successfulProperty = null;

    // GSC data is available for ~16 months back, start from 16 months ago
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 3); // GSC has 3-day delay
    const startDate = new Date(endDate);
    startDate.setMonth(startDate.getMonth() - 16);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Try each property format
    for (const property of propertyCandidates) {
      try {
        await webmasters.searchanalytics.query({
          siteUrl: property,
          requestBody: {
            startDate: startDateStr,
            endDate: endDateStr,
            dimensions: ['date'],
            rowLimit: 1
          }
        });
        successfulProperty = property;
        break;
      } catch (error) {
        if (error.response?.status === 404 || error.response?.status === 403) {
          continue;
        }
      }
    }

    if (!successfulProperty) {
      return res.status(404).json(gscPropertyErrorPayload());
    }

    // Fetch monthly aggregated data
    const monthlyResponse = await webmasters.searchanalytics.query({
      siteUrl: successfulProperty,
      requestBody: {
        startDate: startDateStr,
        endDate: endDateStr,
        dimensions: ['date'],
        rowLimit: 25000
      }
    });

    // Aggregate by month
    const monthlyData = {};
    let totalImpressions = 0;
    let earliestDate = null;
    let latestDate = null;

    if (monthlyResponse.data && monthlyResponse.data.rows) {
      for (const row of monthlyResponse.data.rows) {
        const date = row.keys[0];
        const monthKey = date.substring(0, 7); // YYYY-MM
        
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = {
            impressions: 0,
            clicks: 0,
            position: 0,
            positionCount: 0
          };
        }
        
        monthlyData[monthKey].impressions += row.impressions || 0;
        monthlyData[monthKey].clicks += row.clicks || 0;
        monthlyData[monthKey].position += (row.position || 0) * (row.impressions || 1);
        monthlyData[monthKey].positionCount += row.impressions || 1;
        
        totalImpressions += row.impressions || 0;
        
        if (!earliestDate || date < earliestDate) earliestDate = date;
        if (!latestDate || date > latestDate) latestDate = date;
      }
    }

    // Calculate average positions and format
    const monthlyStats = Object.entries(monthlyData)
      .map(([month, data]) => ({
        month,
        impressions: data.impressions,
        avgPosition: data.positionCount > 0 ? Math.round((data.position / data.positionCount) * 10) / 10 : 0
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Calculate growth trajectory
    const firstMonth = monthlyStats[0];
    const lastMonth = monthlyStats[monthlyStats.length - 1];
    const growthPercent = firstMonth && lastMonth && firstMonth.impressions > 0
      ? Math.round(((lastMonth.impressions - firstMonth.impressions) / firstMonth.impressions) * 100)
      : 0;

    const response = {
      success: true,
      siteUrl,
      dateRange: {
        earliest: earliestDate,
        latest: latestDate,
        monthsOfData: monthlyStats.length
      },
      totals: {
        allTimeImpressions: totalImpressions,
        currentMonthImpressions: lastMonth?.impressions || 0,
        firstMonthImpressions: firstMonth?.impressions || 0,
        growthPercent
      },
      monthlyStats,
      property: successfulProperty
    };

    console.log(`[GSC Historical] Found ${monthlyStats.length} months of data, ${totalImpressions.toLocaleString()} total impressions`);
    res.json(response);

  } catch (error) {
    console.error('[GSC Historical] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch historical stats'
    });
  }
});

/**
 * Fetch GSC Performance Stats for entity pages (service-area pages, location pages, etc.)
 * POST /fetch-entity-pages-performance
 */
router.post('/fetch-entity-pages-performance', async (req, res) => {
  console.log('[GSC Routes] POST /fetch-entity-pages-performance - Request received');
  try {
    const { siteUrl, entityPathPattern, startDate, endDate, compareStartDate, compareEndDate } = req.body;
    
    // Validate required fields
    if (!siteUrl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: siteUrl'
      });
    }

    if (!entityPathPattern) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: entityPathPattern (e.g., "/service-area/")'
      });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required date fields: startDate, endDate'
      });
    }

    // Validate date ranges
    const currentValidation = validateDates(startDate, endDate);
    if (!currentValidation.valid) {
      return res.status(400).json({
        success: false,
        error: `Current period: ${currentValidation.error || 'Invalid date range'}`
      });
    }

    const startDateStr = currentValidation.startDateStr;
    const endDateStr = currentValidation.endDateStr;

    // Comparison period is optional
    let compareStartDateStr = null;
    let compareEndDateStr = null;
    if (compareStartDate && compareEndDate) {
      const compareValidation = validateDates(compareStartDate, compareEndDate);
      if (compareValidation.valid) {
        compareStartDateStr = compareValidation.startDateStr;
        compareEndDateStr = compareValidation.endDateStr;
      }
    }

    console.log(`[GSC Entity Pages] Fetching entity pages for ${siteUrl} matching "${entityPathPattern}"`);
    console.log(`[GSC Entity Pages] Current: ${startDateStr} to ${endDateStr}`);
    if (compareStartDateStr) {
      console.log(`[GSC Entity Pages] Comparison: ${compareStartDateStr} to ${compareEndDateStr}`);
    }

    // Authenticate with service account
    const authClient = await authenticateGSC(false);
    const webmasters = google.webmasters({
      version: 'v3',
      auth: authClient
    });

    // Find the correct property format
    const exactProperty = await findMatchingGSCProperty(siteUrl);
    let propertyCandidates = [];
    
    if (exactProperty) {
      if (exactProperty.startsWith('sc-domain:')) {
        const domain = exactProperty.replace(/^sc-domain:/, '');
        propertyCandidates = [
          `https://${domain}/`,
          `https://${domain}`,
          exactProperty
        ];
      } else {
        propertyCandidates = [exactProperty];
      }
    } else {
      propertyCandidates = generatePropertyCandidates(siteUrl);
    }

    let successfulProperty = null;
    let lastError = null;

    // Try each property format
    for (const property of propertyCandidates) {
      try {
        await webmasters.searchanalytics.query({
          siteUrl: property,
          requestBody: {
            startDate: startDateStr,
            endDate: endDateStr,
            dimensions: ['page'],
            rowLimit: 1
          }
        });
        successfulProperty = property;
        break;
      } catch (error) {
        lastError = error;
        if (error.response?.status === 404 || error.response?.status === 403) {
          continue;
        }
      }
    }

    if (!successfulProperty) {
      return res.status(404).json(gscPropertyErrorPayload());
    }

    // Fetch ALL pages for current period
    const currentPagesResponse = await webmasters.searchanalytics.query({
      siteUrl: successfulProperty,
      requestBody: {
        startDate: startDateStr,
        endDate: endDateStr,
        dimensions: ['page'],
        rowLimit: 25000
      }
    });

    // Filter pages matching entity pattern
    const entityPattern = entityPathPattern.toLowerCase();
    const currentEntityPages = [];
    
    if (currentPagesResponse.data && currentPagesResponse.data.rows) {
      for (const row of currentPagesResponse.data.rows) {
        const pageUrl = row.keys[0].toLowerCase();
        if (pageUrl.includes(entityPattern)) {
          currentEntityPages.push({
            url: row.keys[0],
            clicks: row.clicks || 0,
            impressions: row.impressions || 0,
            ctr: row.ctr || 0,
            position: row.position || 0
          });
        }
      }
    }

    console.log(`[GSC Entity Pages] Found ${currentEntityPages.length} entity pages matching "${entityPathPattern}"`);

    // Fetch comparison period if provided
    let comparisonEntityPages = [];
    if (compareStartDateStr && compareEndDateStr) {
      const comparisonPagesResponse = await webmasters.searchanalytics.query({
        siteUrl: successfulProperty,
        requestBody: {
          startDate: compareStartDateStr,
          endDate: compareEndDateStr,
          dimensions: ['page'],
          rowLimit: 25000
        }
      });

      if (comparisonPagesResponse.data && comparisonPagesResponse.data.rows) {
        for (const row of comparisonPagesResponse.data.rows) {
          const pageUrl = row.keys[0].toLowerCase();
          if (pageUrl.includes(entityPattern)) {
            comparisonEntityPages.push({
              url: row.keys[0],
              clicks: row.clicks || 0,
              impressions: row.impressions || 0,
              ctr: row.ctr || 0,
              position: row.position || 0
            });
          }
        }
      }
    }

    // Create comparison map
    const comparisonMap = new Map();
    comparisonEntityPages.forEach(page => {
      comparisonMap.set(page.url.toLowerCase(), page);
    });

    // Calculate totals and build response
    let totalCurrentImpressions = 0;
    let totalCurrentClicks = 0;
    let totalPreviousImpressions = 0;
    let totalPreviousClicks = 0;
    const newPages = [];

    const pagesWithComparison = currentEntityPages.map(page => {
      const prevPage = comparisonMap.get(page.url.toLowerCase());
      const isNew = !prevPage;
      
      totalCurrentImpressions += page.impressions;
      totalCurrentClicks += page.clicks;
      
      if (prevPage) {
        totalPreviousImpressions += prevPage.impressions;
        totalPreviousClicks += prevPage.clicks;
      } else {
        newPages.push(page.url);
      }

      return {
        url: page.url,
        pagePath: new URL(page.url).pathname,
        clicks: page.clicks,
        impressions: page.impressions,
        position: Math.round(page.position * 10) / 10,
        previousImpressions: prevPage ? prevPage.impressions : 0,
        previousClicks: prevPage ? prevPage.clicks : 0,
        previousPosition: prevPage ? Math.round(prevPage.position * 10) / 10 : 0,
        impressionsChange: prevPage ? page.impressions - prevPage.impressions : page.impressions,
        clicksChange: prevPage ? page.clicks - prevPage.clicks : page.clicks,
        isNew: isNew
      };
    });

    // Sort by impressions (highest first)
    pagesWithComparison.sort((a, b) => b.impressions - a.impressions);

    const response = {
      success: true,
      entityPathPattern: entityPathPattern,
      currentPeriod: {
        startDate: startDateStr,
        endDate: endDateStr,
        totalPages: currentEntityPages.length,
        totalImpressions: totalCurrentImpressions,
        totalClicks: totalCurrentClicks
      },
      comparisonPeriod: compareStartDateStr ? {
        startDate: compareStartDateStr,
        endDate: compareEndDateStr,
        totalPages: comparisonEntityPages.length,
        totalImpressions: totalPreviousImpressions,
        totalClicks: totalPreviousClicks
      } : null,
      comparison: compareStartDateStr ? {
        newPagesCount: newPages.length,
        impressionsChange: totalCurrentImpressions - totalPreviousImpressions,
        clicksChange: totalCurrentClicks - totalPreviousClicks,
        pagesChange: currentEntityPages.length - comparisonEntityPages.length
      } : null,
      pages: pagesWithComparison,
      newPages: newPages,
      property: successfulProperty
    };

    console.log(`[GSC Entity Pages] Success: ${currentEntityPages.length} pages, ${totalCurrentImpressions} impressions`);
    res.json(response);

  } catch (error) {
    console.error('[GSC Entity Pages] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch entity pages performance'
    });
  }
});

module.exports = router;
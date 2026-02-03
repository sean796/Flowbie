/**
 * Company Scraper Routes
 * AI-first company information extraction via DataForSEO and OpenRouter
 */

const express = require('express');
const axios = require('axios');
const {
  DATAFORSEO_API_BASE,
  auth,
  sanitizeDataForSEOPayload,
  LOCATION_MAP,
  ensureLanguageCode,
} = require('./config');
const {
  getLocationCoordinate,
  getPageTextFromOnPageResult,
  fetchPageTextDirect,
  extractCompanyWithAI,
  extractBusinessNamesFromSerp,
  extractSocialLinksAndMapsFromSerp,
  searchForSocialLinks,
  extractCompanyFromGmbRaw,
  extractCompanyFromBusinessListingsRaw,
  mergeCompanyBlobsWithAI,
  normalizeFromBusinessListings,
  normalizeFromGmbInfo,
  generateGoogleMapsPlacesLink,
} = require('./company-scraper-helpers');

const router = express.Router();

/**
 * Call DataForSEO API (same pattern as dataforseo-routes.js)
 */
async function callDataForSEO(endpoint, data) {
  try {
    if (!endpoint || typeof endpoint !== 'string') {
      throw new Error('Invalid endpoint path');
    }

    console.log(`[Company Scraper] Calling DataForSEO: ${endpoint}`);

    // Sanitize payload
    const sanitizedData = sanitizeDataForSEOPayload(data);

    const response = await axios.post(
      `${DATAFORSEO_API_BASE}${endpoint}`,
      sanitizedData,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    console.log(`[Company Scraper] DataForSEO response status: ${response.status}`);

    // Check for errors in result
    if (response.data?.tasks && response.data.tasks[0]) {
      const task = response.data.tasks[0];
      if (task.status_code && task.status_code !== 20000) {
        const errorMsg = task.status_message || `DataForSEO API error code: ${task.status_code}`;
        throw new Error(errorMsg);
      }
    }

    return response.data;
  } catch (error) {
    console.error('[Company Scraper] DataForSEO API error:', error.message);
    if (error.response) {
      console.error('[Company Scraper] Response data:', error.response.data);
      throw new Error(`DataForSEO API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

/**
 * POST /api/company/from-url
 * Extract company info from URL using On-Page Content Parsing + AI
 */
router.post('/api/company/from-url', async (req, res) => {
  try {
    const { url, openRouterApiKey, model, accept_language } = req.body;

    // Validate required fields
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'url is required and must be a string',
      });
    }

    if (!openRouterApiKey || typeof openRouterApiKey !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'OpenRouter API key required for URL fetch.',
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (urlError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format',
      });
    }

    console.log('[Company Scraper] Fetching company from URL:', url);

    // Step 1: Call DataForSEO On-Page Content Parsing
    const onPageData = [{
      url: url,
      enable_javascript: false,
      accept_language: accept_language || 'en',
    }];

    const onPageResult = await callDataForSEO('/on_page/content_parsing', onPageData);

    // Extract page text from result
    const pageText = getPageTextFromOnPageResult(onPageResult.tasks?.[0]?.result || []);

    if (!pageText || pageText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No page content extracted from URL',
      });
    }

    console.log('[Company Scraper] Extracted page text length:', pageText.length);

    // Step 2: Use AI to extract company info
    const company = await extractCompanyWithAI(pageText, url, openRouterApiKey, model);

    // Step 3: Try to get social links from SERP if business name is available
    if (company.businessName && openRouterApiKey) {
      try {
        const locationCode = LOCATION_MAP[req.body.location_name || 'United States'] || LOCATION_MAP['United States'];
        const langCode = ensureLanguageCode('en');
        const serpPayload = [{
          keyword: company.businessName,
          location_code: locationCode,
          language_code: langCode,
          depth: 20,
          device: 'desktop',
          os: 'windows',
          people_also_ask_click_depth: 4,
        }];
        const serpResult = await callDataForSEO('/serp/google/organic/live/advanced', serpPayload);
        
        // Extract social links and Google Maps from SERP
        const socialLinksAndMaps = await extractSocialLinksAndMapsFromSerp(
          serpResult,
          company.businessName,
          openRouterApiKey,
          model
        );
        
        // Merge social links into company data
        if (socialLinksAndMaps.facebook) company.facebook = socialLinksAndMaps.facebook;
        if (socialLinksAndMaps.instagram) company.instagram = socialLinksAndMaps.instagram;
        if (socialLinksAndMaps.linkedin) company.linkedin = socialLinksAndMaps.linkedin;
        
        // Always use SERP page URL as Google Maps Link (user-accessible search results page)
        const serpPageUrl = `https://www.google.com/search?q=${encodeURIComponent(company.businessName)}`;
        // Only use extracted link if it's not a broken Firebase Dynamic Link
        if (socialLinksAndMaps.googleMapsLink && !socialLinksAndMaps.googleMapsLink.includes('maps.app.goo.gl')) {
          company.googleMapsLink = socialLinksAndMaps.googleMapsLink;
        } else {
          company.googleMapsLink = serpPageUrl;
        }
      } catch (serpError) {
        console.warn('[Company Scraper] SERP fetch failed in from-url (continuing):', serpError.message);
        // Still generate SERP URL as fallback
        if (company.businessName) {
          company.googleMapsLink = `https://www.google.com/search?q=${encodeURIComponent(company.businessName)}`;
        }
      }
    }

    console.log('[Company Scraper] Extracted company:', {
      businessName: company.businessName,
      email: company.email ? '***' : '',
      phone: company.phone ? '***' : '',
      siteUrl: company.siteUrl,
      hasFacebook: !!company.facebook,
      hasInstagram: !!company.instagram,
      hasLinkedIn: !!company.linkedin,
      hasGoogleMapsLink: !!company.googleMapsLink,
    });

    return res.json({
      success: true,
      company: company,
    });
  } catch (error) {
    console.error('[Company Scraper] from-url error:', error);
    const statusCode = error.response?.status || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to extract company from URL',
    });
  }
});

/**
 * POST /api/company/from-google-search
 * Loose Google search (SERP) – returns FULL SERP page + AI-extracted business names.
 * AI analyzes entire SERP JSON to find ANY business names (not just knowledge_graph/organic).
 */
router.post('/api/company/from-google-search', async (req, res) => {
  try {
    const { query, location_name, openRouterApiKey, model } = req.body;

    // Validate required fields
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'query is required and must be a non-empty string',
      });
    }

    if (!openRouterApiKey || typeof openRouterApiKey !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'OpenRouter API key required for SERP analysis',
      });
    }

    // Map location_name to location_code for SERP (same as dataforseo-routes SERP)
    const locationCode = LOCATION_MAP[location_name || 'United States'] || LOCATION_MAP['United States'];
    const langCode = ensureLanguageCode('en');

    console.log('[Company Scraper] Google SERP search with AI extraction:', {
      query: query.trim(),
      location_name: location_name || 'United States',
      location_code: locationCode,
    });

    // Call DataForSEO SERP Organic Live Advanced – same params as KWR (depth 20, PAA click depth 4)
    const serpPayload = [{
      keyword: query.trim(),
      location_code: locationCode,
      language_code: langCode,
      depth: 20,
      device: 'desktop',
      os: 'windows',
      people_also_ask_click_depth: 4,
    }];

    const serpResult = await callDataForSEO('/serp/google/organic/live/advanced', serpPayload);

    // Use AI to extract business names from FULL SERP (analyzes entire structure)
    let candidates = [];
    try {
      candidates = await extractBusinessNamesFromSerp(
        serpResult,
        query.trim(),
        openRouterApiKey,
        model || 'openai/gpt-4o-mini'
      );
      console.log('[Company Scraper] AI extracted candidates:', candidates.length);
    } catch (aiError) {
      // #region agent log
      try {
        const fs = require('fs');
        const path = require('path');
        const logPath = path.join(__dirname, '..', '.cursor', 'debug.log');
        const logEntry = JSON.stringify({
          sessionId: 'debug-session',
          runId: 'run1',
          location: 'company-scraper-routes.js:210',
          message: 'AI extraction error caught',
          data: {
            errorMessage: aiError.message,
            errorStack: aiError.stack?.substring(0, 500),
            query: query.trim(),
            hasSerpData: !!serpResult,
          },
          timestamp: Date.now(),
          hypothesisId: 'H1',
        }) + '\n';
        fs.appendFileSync(logPath, logEntry);
      } catch (logError) {
        // Ignore log errors
      }
      // #endregion
      console.error('[Company Scraper] AI extraction error (continuing with empty candidates):', aiError.message);
      // Continue even if AI extraction fails - return full SERP so frontend can parse manually
    }

    // Extract social links and Google Maps info from SERP using AI
    let socialLinksAndMaps = {};
    try {
      socialLinksAndMaps = await extractSocialLinksAndMapsFromSerp(
        serpResult,
        query.trim(),
        openRouterApiKey,
        model || 'openai/gpt-4o-mini'
      );
      console.log('[Company Scraper] AI extracted social links and maps:', socialLinksAndMaps);
    } catch (socialError) {
      console.warn('[Company Scraper] Social links extraction error (continuing):', socialError.message);
    }

      // Always use SERP page URL as Google Maps Link (user-accessible search results page)
      // This is better than broken Firebase Dynamic Links
      const serpPageUrl = `https://www.google.com/search?q=${encodeURIComponent(query.trim())}`;
      socialLinksAndMaps.googleMapsLink = serpPageUrl;

    // Return FULL SERP (like KWR) + AI-extracted candidates + social links + SERP URL
    return res.json({
      success: true,
      serp: serpResult,
      candidates: candidates,
      socialLinks: socialLinksAndMaps,
      serpPageUrl: serpPageUrl,
    });
  } catch (error) {
    console.error('[Company Scraper] from-google-search error:', error);
    const statusCode = error.response?.status || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to fetch Google SERP',
    });
  }
});

/**
 * POST /api/company/gmb-info
 * Fetch Google Business Profile (Places) data via DataForSEO My Business Info API.
 * Use after user validates business name – returns phone, address, hours, website, etc.
 */
router.post('/api/company/gmb-info', async (req, res) => {
  try {
    const { query, location_name, search_query } = req.body;
    const keyword = (typeof search_query === 'string' && search_query.trim()) ? search_query.trim() : (query && typeof query === 'string' ? query.trim() : '');

    // #region agent log
    try {
      const fs = require('fs');
      const path = require('path');
      const logPath = path.join(__dirname, '..', '.cursor', 'debug.log');
      const logEntry = JSON.stringify({
        sessionId: 'debug-session',
        runId: 'run1',
        location: 'company-scraper-routes.js:261',
        message: 'GMB route called',
        data: { query, location_name, search_query, keyword, hasQuery: !!keyword },
        timestamp: Date.now(),
        hypothesisId: 'H1',
      }) + '\n';
      fs.appendFileSync(logPath, logEntry);
    } catch (logError) {
      // Ignore log errors
    }
    // #endregion

    if (!keyword) {
      return res.status(400).json({
        success: false,
        error: 'query or search_query (validated business name) is required',
      });
    }

    const locationCode = LOCATION_MAP[location_name || 'United States'] ?? LOCATION_MAP['United States'];
    const langCode = ensureLanguageCode('en');

    console.log('[Company Scraper] GMB Info:', { keyword, location_name: location_name || 'United States', location_code: locationCode });

    const payload = [{
      keyword,
      location_code: locationCode,
      language_code: langCode,
    }];

    // #region agent log
    try {
      const fs = require('fs');
      const path = require('path');
      const logPath = path.join(__dirname, '..', '.cursor', 'debug.log');
      const logEntry = JSON.stringify({
        sessionId: 'debug-session',
        runId: 'run1',
        location: 'company-scraper-routes.js:285',
        message: 'Calling DataForSEO GMB API',
        data: { payload, locationCode, langCode },
        timestamp: Date.now(),
        hypothesisId: 'H1',
      }) + '\n';
      fs.appendFileSync(logPath, logEntry);
    } catch (logError) {
      // Ignore log errors
    }
    // #endregion

    let gmbResult;
    try {
      gmbResult = await callDataForSEO('/business_data/google/my_business_info/live', payload);
    } catch (gmbApiErr) {
      const msg = gmbApiErr && gmbApiErr.message ? String(gmbApiErr.message) : '';
      const noResults = /no search results|no results|not found|task not found/i.test(msg);
      if (noResults) {
        console.log('[Company Scraper] GMB returned no results, continuing without GMB data:', msg);
        return res.json({ success: true, company: null });
      }
      throw gmbApiErr;
    }

    // #region agent log
    try {
      const fs = require('fs');
      const path = require('path');
      const logPath = path.join(__dirname, '..', '.cursor', 'debug.log');
      const logEntry = JSON.stringify({
        sessionId: 'debug-session',
        runId: 'run1',
        location: 'company-scraper-routes.js:295',
        message: 'DataForSEO GMB response received',
        data: { hasTasks: !!gmbResult.tasks, tasksCount: gmbResult.tasks?.length || 0, firstTaskStatus: gmbResult.tasks?.[0]?.status_code },
        timestamp: Date.now(),
        hypothesisId: 'H1',
      }) + '\n';
      fs.appendFileSync(logPath, logEntry);
    } catch (logError) {
      // Ignore log errors
    }
    // #endregion

    const tasks = gmbResult.tasks || [];
    const t0 = tasks[0];
    let items = [];
    const resVal = t0 && t0.result;
    if (Array.isArray(resVal) && resVal.length > 0) {
      const first = resVal[0];
      items = first && first.items ? first.items : resVal;
    } else if (resVal && Array.isArray(resVal.items)) {
      items = resVal.items;
    }

    // #region agent log
    try {
      const fs = require('fs');
      const path = require('path');
      const logPath = path.join(__dirname, '..', '.cursor', 'debug.log');
      const logEntry = JSON.stringify({
        sessionId: 'debug-session',
        runId: 'run1',
        location: 'company-scraper-routes.js:310',
        message: 'GMB items extracted',
        data: { itemsCount: items.length, hasResult: !!resVal, isArray: Array.isArray(resVal) },
        timestamp: Date.now(),
        hypothesisId: 'H1',
      }) + '\n';
      fs.appendFileSync(logPath, logEntry);
    } catch (logError) {
      // Ignore log errors
    }
    // #endregion

    if (items.length === 0) {
      // #region agent log
      try {
        const fs = require('fs');
        const path = require('path');
        const logPath = path.join(__dirname, '..', '.cursor', 'debug.log');
        const logEntry = JSON.stringify({
          sessionId: 'debug-session',
          runId: 'run1',
          location: 'company-scraper-routes.js:318',
          message: 'GMB returned no items - returning null',
          data: {},
          timestamp: Date.now(),
          hypothesisId: 'H1',
        }) + '\n';
        fs.appendFileSync(logPath, logEntry);
      } catch (logError) {
        // Ignore log errors
      }
      // #endregion
      return res.json({ success: true, company: null });
    }

    const first = items.find((it) => it.type === 'google_business_info') || items[0];
    
    // #region agent log
    try {
      const fs = require('fs');
      const path = require('path');
      const logPath = path.join(__dirname, '..', '.cursor', 'debug.log');
      const logEntry = JSON.stringify({
        sessionId: 'debug-session',
        runId: 'run1',
        location: 'company-scraper-routes.js:330',
        message: 'GMB raw item structure',
        data: {
          hasWorkHours: !!first.work_hours,
          hasWorkHoursTimetable: !!(first.work_hours && first.work_hours.timetable),
          workHoursKeys: first.work_hours ? Object.keys(first.work_hours) : [],
          timetableKeys: first.work_hours && first.work_hours.timetable ? Object.keys(first.work_hours.timetable) : [],
          sampleTimetable: first.work_hours && first.work_hours.timetable ? (first.work_hours.timetable.monday ? { monday: first.work_hours.timetable.monday.slice(0, 1) } : {}) : null,
        },
        timestamp: Date.now(),
        hypothesisId: 'H1',
      }) + '\n';
      fs.appendFileSync(logPath, logEntry);
    } catch (logError) {
      // Ignore log errors
    }
    // #endregion
    
    // Use AI to extract company data from raw GMB item
    let company = {};
    const { openRouterApiKey, model } = req.body;
    if (openRouterApiKey) {
      try {
        company = await extractCompanyFromGmbRaw(first, openRouterApiKey, model);
      } catch (aiErr) {
        console.warn('[Company Scraper] GMB AI extraction failed, falling back to manual normalization:', aiErr.message);
        company = normalizeFromGmbInfo(first);
      }
    } else {
      // Fallback to manual normalization if no API key
      company = normalizeFromGmbInfo(first);
    }

    // #region agent log
    try {
      const fs = require('fs');
      const path = require('path');
      const logPath = path.join(__dirname, '..', '.cursor', 'debug.log');
      const logEntry = JSON.stringify({
        sessionId: 'debug-session',
        runId: 'run1',
        location: 'company-scraper-routes.js:350',
        message: 'GMB company extracted',
        data: { hasBusinessName: !!company.businessName, hasPhone: !!company.phone, hasAddress: !!company.address, hasWorkHours: !!company.workHours, workHours: company.workHours || '' },
        timestamp: Date.now(),
        hypothesisId: 'H1',
      }) + '\n';
      fs.appendFileSync(logPath, logEntry);
    } catch (logError) {
      // Ignore log errors
    }
    // #endregion

    // Try to get social links from SERP if business name is available
    if (company.businessName && openRouterApiKey) {
      try {
        const locationCode = LOCATION_MAP[location_name || 'United States'] ?? LOCATION_MAP['United States'];
        const langCode = ensureLanguageCode('en');
        const serpPayload = [{
          keyword: company.businessName,
          location_code: locationCode,
          language_code: langCode,
          depth: 20,
          device: 'desktop',
          os: 'windows',
          people_also_ask_click_depth: 4,
        }];
        const serpResult = await callDataForSEO('/serp/google/organic/live/advanced', serpPayload);
        
        // Extract social links and Google Maps from SERP
        const socialLinksAndMaps = await extractSocialLinksAndMapsFromSerp(
          serpResult,
          company.businessName,
          openRouterApiKey,
          model
        );
        
        // Merge social links into company data
        if (socialLinksAndMaps.facebook) company.facebook = socialLinksAndMaps.facebook;
        if (socialLinksAndMaps.instagram) company.instagram = socialLinksAndMaps.instagram;
        if (socialLinksAndMaps.linkedin) company.linkedin = socialLinksAndMaps.linkedin;
        
        // Always use SERP page URL as Google Maps Link (user-accessible search results page)
        const serpPageUrl = `https://www.google.com/search?q=${encodeURIComponent(company.businessName)}`;
        // Only use extracted link if it's not a broken Firebase Dynamic Link
        if (socialLinksAndMaps.googleMapsLink && !socialLinksAndMaps.googleMapsLink.includes('maps.app.goo.gl')) {
          company.googleMapsLink = socialLinksAndMaps.googleMapsLink;
        } else {
          company.googleMapsLink = serpPageUrl;
        }
      } catch (serpError) {
        console.warn('[Company Scraper] SERP fetch failed in gmb-info (continuing):', serpError.message);
        // Still generate SERP URL as fallback
        if (company.businessName) {
          company.googleMapsLink = `https://www.google.com/search?q=${encodeURIComponent(company.businessName)}`;
        }
      }
    }

    console.log('[Company Scraper] GMB company:', {
      businessName: company.businessName || company.title || '',
      phone: company.phone ? '***' : '',
      address: company.address ? '***' : '',
      workHours: company.workHours ? '***' : '',
      hasFacebook: !!company.facebook,
      hasInstagram: !!company.instagram,
      hasLinkedIn: !!company.linkedin,
      hasGoogleMapsLink: !!company.googleMapsLink,
    });

    return res.json({ success: true, company });
  } catch (error) {
    console.error('[Company Scraper] gmb-info error:', error);
    const statusCode = error.response?.status || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to fetch GMB info',
    });
  }
});

/**
 * POST /api/company/resolve
 * Resolve company from candidate: orchestrates GMB + URL + BL, then AI merges into single blob
 * Input: { candidate: { name, url?, snippet? }, location_name, openRouterApiKey?, model? }
 */
router.post('/api/company/resolve', async (req, res) => {
  try {
    const { candidate, search_query, location_name, openRouterApiKey, model } = req.body;

    if (!candidate || !candidate.name) {
      return res.status(400).json({
        success: false,
        error: 'candidate with name is required',
      });
    }

    if (!openRouterApiKey) {
      return res.status(400).json({
        success: false,
        error: 'openRouterApiKey is required for resolve',
      });
    }

    const blobs = [];
    const gmbKeyword = (typeof search_query === 'string' && search_query.trim()) ? search_query.trim() : candidate.name;

    // Step 1: GMB (use search_query e.g. "Blind Magic Edmonton" when provided)
    try {
      const locationCode = LOCATION_MAP[location_name || 'United States'] ?? LOCATION_MAP['United States'];
      const langCode = ensureLanguageCode('en');

      const gmbPayload = [{
        keyword: gmbKeyword,
        location_code: locationCode,
        language_code: langCode,
      }];

      const gmbResult = await callDataForSEO('/business_data/google/my_business_info/live', gmbPayload);
      const tasks = gmbResult.tasks || [];
      const t0 = tasks[0];
      let items = [];
      const resVal = t0 && t0.result;
      if (Array.isArray(resVal) && resVal.length > 0) {
        const first = resVal[0];
        items = first && first.items ? first.items : resVal;
      } else if (resVal && Array.isArray(resVal.items)) {
        items = resVal.items;
      }

      if (items.length > 0) {
        const first = items.find((it) => it.type === 'google_business_info') || items[0];
        const gmbBlob = await extractCompanyFromGmbRaw(first, openRouterApiKey, model);
        // #region agent log
        try {
          const fs = require('fs');
          const path = require('path');
          const logPath = path.join(__dirname, '..', '.cursor', 'debug.log');
          const logEntry = JSON.stringify({ sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H4', location: 'company-scraper-routes.js:resolve:gmbBlob', message: 'GMB blob social keys', data: { facebook: gmbBlob?.facebook, instagram: gmbBlob?.instagram, linkedin: gmbBlob?.linkedin }, timestamp: Date.now() }) + '\n';
          fs.appendFileSync(logPath, logEntry);
        } catch (e) { /* ignore */ }
        // #endregion
        if (gmbBlob && Object.keys(gmbBlob).length > 0) {
          blobs.push(gmbBlob);
        }
      }
    } catch (gmbErr) {
      console.warn('[Company Scraper] GMB fetch failed in resolve:', gmbErr.message);
    }

    // Step 2: URL (if candidate has URL) – DataForSEO On-Page first, then direct fetch fallback
    if (candidate.url && openRouterApiKey) {
      const url = candidate.url.startsWith('http') ? candidate.url : `https://${candidate.url}`;
      let pageText = '';
      try {
        const onPageData = [{
          url: url,
          enable_javascript: false,
          accept_language: 'en',
        }];
        const onPageResult = await callDataForSEO('/on_page/content_parsing', onPageData);
        pageText = getPageTextFromOnPageResult(onPageResult.tasks?.[0]?.result || []);
      } catch (onPageErr) {
        console.warn('[Company Scraper] DataForSEO On-Page failed in resolve, trying direct fetch:', onPageErr.message);
        try {
          pageText = await fetchPageTextDirect(url);
        } catch (directErr) {
          console.warn('[Company Scraper] Direct URL fetch failed in resolve:', directErr.message);
        }
      }
      if (pageText && pageText.trim().length > 0) {
        try {
          const urlBlob = await extractCompanyWithAI(pageText, url, openRouterApiKey, model);
          if (urlBlob && Object.keys(urlBlob).length > 0) {
            blobs.push(urlBlob);
          }
        } catch (aiErr) {
          console.warn('[Company Scraper] AI extract from URL failed in resolve:', aiErr.message);
        }
      }
    }

    // Step 3: Business Listings (optional fallback) – prefer results matching candidate URL domain
    if (blobs.length === 0) {
      try {
        const locationCoordinate = getLocationCoordinate(location_name || 'United States');
        const searchData = [{
          title: gmbKeyword,
          location_coordinate: locationCoordinate,
          limit: 10,
        }];

        const searchResult = await callDataForSEO('/business_data/business_listings/search/live', searchData);
        const tasks = searchResult.tasks || [];
        const t0 = tasks[0];
        const resVal = t0 && t0.result;
        const items = Array.isArray(resVal) ? resVal : (resVal?.items || []);

        if (items.length > 0) {
          let chosen = items[0];
          if (candidate.url) {
            try {
              const candidateHost = new URL(candidate.url.startsWith('http') ? candidate.url : `https://${candidate.url}`).hostname.replace(/^www\./, '');
              const match = items.find((it) => {
                try {
                  const u = it.url || it.link || it.website || '';
                  if (!u) return false;
                  const full = u.startsWith('http') ? u : `https://${u}`;
                  const h = new URL(full).hostname.replace(/^www\./, '');
                  return h === candidateHost || candidateHost.endsWith(h) || h.endsWith(candidateHost);
                } catch {
                  return false;
                }
              });
              if (match) chosen = match;
            } catch (e) {
              /* ignore */
            }
          }
          const blBlob = await extractCompanyFromBusinessListingsRaw(chosen, openRouterApiKey, model);
          if (blBlob && Object.keys(blBlob).length > 0) {
            blobs.push(blBlob);
          }
        }
      } catch (blErr) {
        console.warn('[Company Scraper] Business Listings fetch failed in resolve:', blErr.message);
      }
    }

    // Step 4: Fetch SERP to extract social links and Google Maps info
    let socialLinksAndMaps = {};
    let serpPageUrl = '';
    try {
      const locationCode = LOCATION_MAP[location_name || 'United States'] ?? LOCATION_MAP['United States'];
      const langCode = ensureLanguageCode('en');
      const serpPayload = [{
        keyword: gmbKeyword,
        location_code: locationCode,
        language_code: langCode,
        depth: 20,
        device: 'desktop',
        os: 'windows',
        people_also_ask_click_depth: 4,
      }];
      const serpResult = await callDataForSEO('/serp/google/organic/live/advanced', serpPayload);
      
      // #region agent log
      try {
        const fs = require('fs');
        const path = require('path');
        const logPath = path.join(__dirname, '..', '.cursor', 'debug.log');
        const logEntry = JSON.stringify({ sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H3', location: 'company-scraper-routes.js:resolve:preSocialExtract', message: 'About to call extractSocialLinksAndMapsFromSerp', data: { gmbKeyword, hasSerpResult: !!serpResult }, timestamp: Date.now() }) + '\n';
        fs.appendFileSync(logPath, logEntry);
      } catch (e) { /* ignore */ }
      // #endregion
      
      // Extract social links and Google Maps from SERP using AI
      socialLinksAndMaps = await extractSocialLinksAndMapsFromSerp(
        serpResult,
        gmbKeyword,
        openRouterApiKey,
        model
      );
      
      // Generate SERP page URL (the search results page URL)
      serpPageUrl = `https://www.google.com/search?q=${encodeURIComponent(gmbKeyword)}`;
      if (!socialLinksAndMaps.googleMapsLink) {
        socialLinksAndMaps.googleMapsLink = serpPageUrl;
      }
      
      console.log('[Company Scraper] Extracted from SERP:', { socialLinksAndMaps, serpPageUrl });
    } catch (serpError) {
      console.warn('[Company Scraper] SERP fetch failed in resolve (continuing):', serpError.message);
      // Always generate SERP page URL (user-accessible search results page)
      serpPageUrl = `https://www.google.com/search?q=${encodeURIComponent(gmbKeyword)}`;
      socialLinksAndMaps.googleMapsLink = serpPageUrl;
    }

    // Step 5: AI merge all blobs (pass search context so AI prefers matching location/domain)
    const mergeContext = {
      searchQuery: search_query || candidate.name,
      locationName: location_name || '',
      candidateUrl: candidate.url || '',
    };
    let company = {};
    if (blobs.length > 0) {
      if (blobs.length === 1) {
        company = blobs[0];
      } else {
        company = await mergeCompanyBlobsWithAI(blobs, openRouterApiKey, model, mergeContext);
      }
    }

    // Step 6: Actively search for social links (website scraping + targeted SERP searches)
    let searchedSocialLinks = {};
    try {
      const websiteUrl = company.siteUrl || candidate.url || '';
      const businessName = company.businessName || candidate.name || '';
      if (websiteUrl || businessName) {
        const locationCode = LOCATION_MAP[location_name || 'United States'] ?? LOCATION_MAP['United States'];
        const langCode = ensureLanguageCode('en');
        searchedSocialLinks = await searchForSocialLinks(
          websiteUrl,
          businessName,
          locationCode,
          langCode,
          openRouterApiKey,
          callDataForSEO,
          getPageTextFromOnPageResult,
          fetchPageTextDirect,
          model
        );
        // #region agent log
        try {
          const fs = require('fs');
          const path = require('path');
          const logPath = path.join(__dirname, '..', '.cursor', 'debug.log');
          const logEntry = JSON.stringify({ sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H3', location: 'company-scraper-routes.js:resolve:searchedSocialLinks', message: 'Searched social links result', data: { searchedSocialLinks }, timestamp: Date.now() }) + '\n';
          fs.appendFileSync(logPath, logEntry);
        } catch (e) { /* ignore */ }
        // #endregion
      }
    } catch (searchErr) {
      console.warn('[Company Scraper] Social link search failed (continuing):', searchErr.message);
    }

    // Merge social links: prioritize searched links, then SERP-extracted links
    if (searchedSocialLinks.facebook) {
      company.facebook = searchedSocialLinks.facebook;
    } else if (socialLinksAndMaps.facebook) {
      company.facebook = socialLinksAndMaps.facebook;
    }
    if (searchedSocialLinks.instagram) {
      company.instagram = searchedSocialLinks.instagram;
    } else if (socialLinksAndMaps.instagram) {
      company.instagram = socialLinksAndMaps.instagram;
    }
    if (searchedSocialLinks.linkedin) {
      company.linkedin = searchedSocialLinks.linkedin;
    } else if (socialLinksAndMaps.linkedin) {
      company.linkedin = socialLinksAndMaps.linkedin;
    }
    // Always use SERP page URL as Google Maps Link (user-accessible search results page)
    // This ensures users can access the business profile through the search results
    if (serpPageUrl) {
      company.googleMapsLink = serpPageUrl;
    } else if (socialLinksAndMaps.googleMapsLink && !socialLinksAndMaps.googleMapsLink.includes('maps.app.goo.gl')) {
      // Only use extracted link if it's not a broken Firebase Dynamic Link
      company.googleMapsLink = socialLinksAndMaps.googleMapsLink;
    } else if (company.businessName) {
      // Fallback: generate SERP URL from business name
      company.googleMapsLink = `https://www.google.com/search?q=${encodeURIComponent(company.businessName)}`;
    }

    // #region agent log
    try {
      const fs = require('fs');
      const path = require('path');
      const logPath = path.join(__dirname, '..', '.cursor', 'debug.log');
      const logEntry = JSON.stringify({ sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H5', location: 'company-scraper-routes.js:resolve:postMerge', message: 'After merging social+SERP into company', data: { companyFacebook: company.facebook, companyInstagram: company.instagram, companyLinkedin: company.linkedin, companyGoogleMapsLink: company.googleMapsLink, socialLinksFromSerp: { fb: !!socialLinksAndMaps.facebook, ig: !!socialLinksAndMaps.instagram, li: !!socialLinksAndMaps.linkedin } }, timestamp: Date.now() }) + '\n';
      fs.appendFileSync(logPath, logEntry);
    } catch (e) { /* ignore */ }
    // #endregion

    // Fallback: minimal company data from candidate
    if (!company || Object.keys(company).length === 0) {
      company = {
        businessName: candidate.name,
        siteUrl: candidate.url || '',
      };
      if (serpPageUrl) {
        company.googleMapsLink = serpPageUrl;
      }
    }

    return res.json({ success: true, company });
  } catch (error) {
    console.error('[Company Scraper] resolve error:', error);
    const statusCode = error.response?.status || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to resolve company',
    });
  }
});

/**
 * POST /api/company/from-search
 * Search for company using Business Listings Search
 * Now expects validated business name (from user selection)
 */
router.post('/api/company/from-search', async (req, res) => {
  try {
    const { query, location_name } = req.body;

    // Validate required fields
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'query (company name) is required and must be a non-empty string',
      });
    }

    // Get location coordinate
    const locationCoordinate = getLocationCoordinate(location_name || 'United States');

    console.log('[Company Scraper] Searching for company:', {
      query,
      location_name: location_name || 'United States',
      location_coordinate: locationCoordinate,
    });

    // Call DataForSEO Business Listings Search
    const searchData = [{
      title: query.trim(),
      location_coordinate: locationCoordinate,
      limit: 10,
    }];

    const searchResult = await callDataForSEO('/business_data/business_listings/search/live', searchData);

    // Extract results
    const tasks = searchResult.tasks || [];
    const t0 = tasks[0];
    const resVal = t0 && t0.result;

    if (tasks.length === 0 || !t0 || !resVal) {
      return res.json({
        success: true,
        companies: [],
      });
    }

    const items = Array.isArray(resVal) ? resVal : (resVal.items || []);

    if (items.length === 0) {
      return res.json({
        success: true,
        companies: [],
      });
    }

    // Use AI extraction if API key provided, otherwise fallback to manual normalization
    const { openRouterApiKey, model } = req.body;
    let companies = [];
    
    if (openRouterApiKey) {
      try {
        const extractionPromises = items.map(item => 
          extractCompanyFromBusinessListingsRaw(item, openRouterApiKey, model).catch(() => normalizeFromBusinessListings(item))
        );
        companies = await Promise.all(extractionPromises);
      } catch (aiErr) {
        console.warn('[Company Scraper] AI extraction failed, using manual normalization:', aiErr.message);
        companies = items.map(item => normalizeFromBusinessListings(item));
      }
    } else {
      companies = items.map(item => normalizeFromBusinessListings(item));
    }

    console.log('[Company Scraper] Found companies:', companies.length);

    return res.json({
      success: true,
      companies: companies,
    });
  } catch (error) {
    console.error('[Company Scraper] from-search error:', error);
    const statusCode = error.response?.status || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to search for company',
    });
  }
});

module.exports = router;

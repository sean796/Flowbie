/**
 * Company Scraper Helpers
 * AI-first extraction with minimal manual code
 */

const axios = require('axios');

/**
 * Location coordinate map for Business Listings Search
 * Maps location names to "lat,lng,radius_km" format
 */
const LOCATION_COORDINATE_MAP = {
  'United States': '39.8283,-98.5795,5000',
  'United Kingdom': '55.3781,-3.4360,1000',
  'Canada': '56.1304,-106.3468,5000',
  'Australia': '-25.2744,133.7751,5000',
};

/**
 * Generate Google Maps Places link from company data
 * Creates a search URL that can be used to find the business on Google Maps
 * @param {Object} companyData - Company data object with address components
 * @returns {string} - Google Maps Places search URL
 */
function generateGoogleMapsPlacesLink(companyData) {
  const parts = [];
  if (companyData.businessName) parts.push(companyData.businessName);
  if (companyData.address) parts.push(companyData.address);
  if (companyData.city) parts.push(companyData.city);
  if (companyData.stateProvince) parts.push(companyData.stateProvince);
  if (companyData.postalCode) parts.push(companyData.postalCode);
  if (companyData.country) parts.push(companyData.country);
  
  if (parts.length === 0) {
    return '';
  }
  
  const query = parts.filter(p => p && p.trim() && p !== 'N/A').join(', ');
  if (!query) {
    return '';
  }
  
  // Use Google Maps search URL format that works well for business places
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * Get location coordinate from location name
 * @param {string} locationName - Location name (e.g., "United States")
 * @returns {string} - Location coordinate string "lat,lng,radius_km"
 */
function getLocationCoordinate(locationName) {
  return LOCATION_COORDINATE_MAP[locationName] || LOCATION_COORDINATE_MAP['United States'];
}

/**
 * Fetch page HTML directly and extract text (fallback when DataForSEO On-Page fails)
 * @param {string} url - Full URL to fetch
 * @returns {Promise<string>} - Plain text extracted from page
 */
async function fetchPageTextDirect(url) {
  const u = url.startsWith('http') ? url : `https://${url}`;
  const response = await axios.get(u, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: 15000,
    maxContentLength: 2 * 1024 * 1024,
    validateStatus: (s) => s >= 200 && s < 400,
  });
  const html = typeof response.data === 'string' ? response.data : '';
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length > 12000 ? stripped.substring(0, 12000) + '...' : stripped;
}

/**
 * Extract page text from DataForSEO On-Page Content Parsing result
 * Concatenates header, primary_content, and/or page_as_markdown
 * @param {any} parsed - DataForSEO On-Page result (tasks[0].result)
 * @returns {string} - Concatenated page text
 */
function getPageTextFromOnPageResult(parsed) {
  if (!parsed) {
    return '';
  }

  // Handle array of result items (typical DataForSEO structure)
  if (Array.isArray(parsed)) {
    let allTextParts = [];
    
    // Process each result item in the array
    for (const resultItem of parsed) {
      const items = resultItem?.items || [];
      
      for (const item of items) {
        if (item.type === 'content_parsing_element' && item.page_content) {
          // Extract from page_content
          if (item.page_content.header) {
            const headerText = extractTextFromContent(item.page_content.header);
            if (headerText) allTextParts.push(headerText);
          }
          
          if (item.page_content.primary_content) {
            const primaryText = extractTextFromContent(item.page_content.primary_content);
            if (primaryText) allTextParts.push(primaryText);
          }
        }
        
        // Prefer markdown if available (cleaner)
        if (item.page_as_markdown) {
          allTextParts.push(item.page_as_markdown);
        }
      }
    }
    
    return allTextParts.join('\n\n');
  }

  // Handle single result object (fallback)
  if (parsed.items && Array.isArray(parsed.items)) {
    let textParts = [];
    
    for (const item of parsed.items) {
      if (item.type === 'content_parsing_element' && item.page_content) {
        if (item.page_content.header) {
          const headerText = extractTextFromContent(item.page_content.header);
          if (headerText) textParts.push(headerText);
        }
        
        if (item.page_content.primary_content) {
          const primaryText = extractTextFromContent(item.page_content.primary_content);
          if (primaryText) textParts.push(primaryText);
        }
        
        if (item.page_as_markdown) {
          textParts.push(item.page_as_markdown);
        }
      }
    }
    
    return textParts.join('\n\n');
  }

  return '';
}

/**
 * Extract text from content structure (recursive)
 * @param {any} content - Content object or string
 * @returns {string} - Extracted text
 */
function extractTextFromContent(content) {
  if (typeof content === 'string') {
    return content;
  }
  
  if (Array.isArray(content)) {
    return content.map(item => extractTextFromContent(item)).join(' ');
  }
  
  if (content && typeof content === 'object') {
    // Try common text fields
    if (content.text) return content.text;
    if (content.content) return extractTextFromContent(content.content);
    if (content.value) return String(content.value);
    
    // Recursively extract from all values
    const texts = Object.values(content)
      .map(val => extractTextFromContent(val))
      .filter(t => t && t.trim().length > 0);
    
    return texts.join(' ');
  }
  
  return '';
}

/**
 * Extract company information using AI (OpenRouter)
 * Schema-free: AI returns whatever keys make sense; we pass through as-is.
 * @param {string} text - Page text to analyze
 * @param {string} url - Requested URL
 * @param {string} openRouterApiKey - OpenRouter API key
 * @param {string} model - Optional model (defaults to gpt-4o-mini)
 * @returns {Promise<Object>} - Company info object (flexible blob)
 */
async function extractCompanyWithAI(text, url, openRouterApiKey, model = 'openai/gpt-4o-mini') {
  if (!text || !text.trim()) {
    throw new Error('No text provided for AI extraction');
  }

  if (!openRouterApiKey) {
    throw new Error('OpenRouter API key required');
  }

  const truncatedText = text.length > 12000 ? text.substring(0, 12000) + '...' : text;

  const systemPrompt = `You are a company information extractor. Extract structured company information from web page text. Return only valid JSON, no markdown, no explanations.`;

  const userPrompt = `Extract all company information from the following web page text. Return a single JSON object. Use whatever keys make sense (e.g. businessName, email, phone, address, workHours, siteUrl, facebook, instagram, linkedin, city, stateProvince, postalCode, country, googleMapsLink, etc.). 

CRITICAL EXTRACTION RULES:
1. Social Media Links: Look for Facebook, Instagram, and LinkedIn URLs anywhere in the page text. Extract them as "facebook", "instagram", "linkedin". Only include URLs that are actual social media profile links (e.g., facebook.com/..., instagram.com/..., linkedin.com/company/... or linkedin.com/in/...). Do NOT include generic facebook.com or instagram.com without a path.

2. Google Maps Link: If you find a Google Maps Places link (maps.app.goo.gl, maps.google.com, or g.co/maps), include it as "googleMapsLink". However, note that maps.app.goo.gl links may be broken Firebase Dynamic Links - prefer maps.google.com or g.co/maps links. If no Google Maps link is found, do NOT generate a placeholder - leave it empty.

Omit any field not found. Do not invent data. Do not use placeholders.

Page URL: ${url}

Page text:
${truncatedText}`;

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          'Authorization': `Bearer ${openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://agent-blueprint-builder.com',
          'X-Title': 'Agent Blueprint Builder',
        },
        timeout: 30000,
      }
    );

    if (!response.data || !response.data.choices || response.data.choices.length === 0) {
      throw new Error('No response from OpenRouter API');
    }

    const content = response.data.choices[0].message.content.trim();
    if (!content) {
      throw new Error('Empty response from OpenRouter API');
    }

    let companyData;
    try {
      companyData = JSON.parse(content);
    } catch (parseError) {
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        companyData = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error(`Failed to parse AI response as JSON: ${parseError.message}`);
      }
    }

    if (typeof companyData !== 'object' || companyData === null) {
      return {};
    }
    if (!companyData.siteUrl && url) {
      companyData.siteUrl = url;
    }
    // Generate Google Maps Places link if address is available but link is missing
    if (!companyData.googleMapsLink && (companyData.address || (companyData.city && companyData.stateProvince))) {
      companyData.googleMapsLink = generateGoogleMapsPlacesLink(companyData);
    }
    return companyData;
  } catch (error) {
    if (error.response) {
      console.error('[Company Scraper] OpenRouter API error:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
      });
      throw new Error(`OpenRouter API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

/**
 * Extract social links and Google Maps info from SERP using AI
 * Analyzes entire SERP JSON to find Facebook, Instagram, LinkedIn links and Google Maps Places URLs
 * @param {any} serpData - Full DataForSEO SERP response
 * @param {string} query - Original search query
 * @param {string} openRouterApiKey - OpenRouter API key
 * @param {string} model - Optional model (defaults to gpt-4o-mini)
 * @returns {Promise<{facebook?: string, instagram?: string, linkedin?: string, googleMapsLink?: string}>} - Social links and Google Maps link
 */
async function extractSocialLinksAndMapsFromSerp(serpData, query, openRouterApiKey, model = 'openai/gpt-4o-mini') {
  if (!serpData) {
    return {};
  }

  if (!openRouterApiKey) {
    throw new Error('OpenRouter API key required for SERP analysis');
  }

  // Serialize SERP to JSON string, truncate if too large (~50k chars max)
  let serpJson = JSON.stringify(serpData, null, 2);
  if (serpJson.length > 50000) {
    serpJson = serpJson.substring(0, 50000) + '\n... (truncated)';
  }

  // #region agent log
  try {
    const fs = require('fs');
    const path = require('path');
    const logPath = path.join(__dirname, '..', '.cursor', 'debug.log');
    const logEntry = JSON.stringify({ sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H1', location: 'company-scraper-helpers.js:extractSocialLinksAndMapsFromSerp:entry', message: 'Social+SERP extraction entry', data: { query, serpJsonLength: serpJson.length }, timestamp: Date.now() }) + '\n';
    fs.appendFileSync(logPath, logEntry);
  } catch (e) { /* ignore */ }
  // #endregion

  const systemPrompt = `You are a social media and Google Maps link extractor. Analyze Google SERP (Search Engine Results Page) JSON data and extract social media links (Facebook, Instagram, LinkedIn) and Google Maps Places links. Return only valid JSON, no markdown, no explanations.`;

  const userPrompt = `Analyze this Google SERP JSON data for the query "${query}" and extract:
1. Social media links: Facebook, Instagram, LinkedIn URLs (if found anywhere in the SERP)
2. Google Maps Places link: Look for Google Maps URLs (maps.google.com, maps.app.goo.gl, g.co/maps) or Google Business Profile links

Search through knowledge graphs, organic results, local packs, featured snippets, and any other SERP features. Return a JSON object with keys: "facebook", "instagram", "linkedin", "googleMapsLink". Only include keys for links that are actually found. If no links found, return {}.

SERP JSON data:
${serpJson}`;

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          'Authorization': `Bearer ${openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://agent-blueprint-builder.com',
          'X-Title': 'Agent Blueprint Builder',
        },
        timeout: 30000,
      }
    );

    if (!response.data || !response.data.choices || response.data.choices.length === 0) {
      throw new Error('No response from OpenRouter API');
    }

    const content = response.data.choices[0].message.content.trim();
    if (!content) {
      throw new Error('Empty response from OpenRouter API');
    }

    // #region agent log
    try {
      const fs = require('fs');
      const path = require('path');
      const logPath = path.join(__dirname, '..', '.cursor', 'debug.log');
      const logEntry = JSON.stringify({ sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H1', location: 'company-scraper-helpers.js:extractSocialLinksAndMapsFromSerp:raw', message: 'Social+SERP AI raw response', data: { contentLength: content.length, contentPreview: content.substring(0, 800) }, timestamp: Date.now() }) + '\n';
      fs.appendFileSync(logPath, logEntry);
    } catch (e) { /* ignore */ }
    // #endregion

    let result;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error(`Failed to parse AI response as JSON: ${parseError.message}`);
      }
    }

    // #region agent log
    try {
      const fs = require('fs');
      const path = require('path');
      const logPath = path.join(__dirname, '..', '.cursor', 'debug.log');
      const logEntry = JSON.stringify({ sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H1', location: 'company-scraper-helpers.js:extractSocialLinksAndMapsFromSerp:parsed', message: 'Social+SERP parsed result', data: { result }, timestamp: Date.now() }) + '\n';
      fs.appendFileSync(logPath, logEntry);
    } catch (e) { /* ignore */ }
    // #endregion

    // Validate and clean URLs
    const cleaned = {};
    if (result.facebook && typeof result.facebook === 'string' && result.facebook.startsWith('http')) {
      const fbUrl = result.facebook.trim();
      // Only include if it's a real Facebook profile/page URL
      if (fbUrl.includes('facebook.com/') && !fbUrl.endsWith('facebook.com') && !fbUrl.endsWith('facebook.com/')) {
        cleaned.facebook = fbUrl;
      }
    }
    if (result.instagram && typeof result.instagram === 'string' && result.instagram.startsWith('http')) {
      const igUrl = result.instagram.trim();
      // Only include if it's a real Instagram profile URL
      if (igUrl.includes('instagram.com/') && !igUrl.endsWith('instagram.com') && !igUrl.endsWith('instagram.com/')) {
        cleaned.instagram = igUrl;
      }
    }
    if (result.linkedin && typeof result.linkedin === 'string' && result.linkedin.startsWith('http')) {
      const liUrl = result.linkedin.trim();
      // Only include if it's a real LinkedIn profile/company URL
      if (liUrl.includes('linkedin.com/') && (liUrl.includes('/company/') || liUrl.includes('/in/') || liUrl.includes('/pub/'))) {
        cleaned.linkedin = liUrl;
      }
    }
    // For Google Maps, prefer SERP page URL or valid Google Maps URLs, avoid broken Firebase links
    if (result.googleMapsLink && typeof result.googleMapsLink === 'string' && result.googleMapsLink.startsWith('http')) {
      const mapsUrl = result.googleMapsLink.trim();
      // Avoid broken Firebase Dynamic Links (maps.app.goo.gl)
      if (!mapsUrl.includes('maps.app.goo.gl')) {
        cleaned.googleMapsLink = mapsUrl;
      }
    }

    // #region agent log
    try {
      const fs = require('fs');
      const path = require('path');
      const logPath = path.join(__dirname, '..', '.cursor', 'debug.log');
      const logEntry = JSON.stringify({ sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H1', location: 'company-scraper-helpers.js:extractSocialLinksAndMapsFromSerp:cleaned', message: 'Social+SERP cleaned result', data: { cleaned }, timestamp: Date.now() }) + '\n';
      fs.appendFileSync(logPath, logEntry);
    } catch (e) { /* ignore */ }
    // #endregion

    return cleaned;
  } catch (error) {
    if (error.response) {
      console.error('[Company Scraper] OpenRouter API error (social links extraction):', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
      });
      throw new Error(`OpenRouter API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

/**
 * Actively search for social media links by scraping website and performing targeted SERP searches
 * @param {string} websiteUrl - Company website URL
 * @param {string} businessName - Business name
 * @param {number} locationCode - DataForSEO location code
 * @param {string} langCode - Language code (e.g., "en")
 * @param {string} openRouterApiKey - OpenRouter API key
 * @param {Function} callDataForSEO - Function to call DataForSEO API
 * @param {Function} getPageTextFromOnPageResult - Function to extract page text
 * @param {Function} fetchPageTextDirect - Function to fetch page text directly
 * @param {string} model - Optional model (defaults to gpt-4o-mini)
 * @returns {Promise<{facebook?: string, instagram?: string, linkedin?: string}>} - Found social links
 */
async function searchForSocialLinks(websiteUrl, businessName, locationCode, langCode, openRouterApiKey, callDataForSEO, getPageTextFromOnPageResult, fetchPageTextDirect, model = 'openai/gpt-4o-mini') {
  const found = {};

  // Strategy 1: Scrape website for social links
  if (websiteUrl) {
    try {
      let pageText = '';
      const url = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
      
      // Try DataForSEO On-Page first
      try {
        const onPageData = [{
          url: url,
          enable_javascript: false,
          accept_language: 'en',
        }];
        const onPageResult = await callDataForSEO('/on_page/content_parsing', onPageData);
        pageText = getPageTextFromOnPageResult(onPageResult.tasks?.[0]?.result || []);
      } catch (onPageErr) {
        // Fallback to direct fetch
        try {
          pageText = await fetchPageTextDirect(url);
        } catch (directErr) {
          // Ignore
        }
      }

      if (pageText && pageText.trim().length > 100) {
        const systemPrompt = `You are a social media link extractor. Extract Facebook, Instagram, and LinkedIn profile URLs from website content. Return only valid JSON with keys: "facebook", "instagram", "linkedin". Only include keys for URLs that are actual social media profile links.`;
        const userPrompt = `Extract social media links (Facebook, Instagram, LinkedIn) from this website content. Look for URLs like:
- facebook.com/username or facebook.com/pagename
- instagram.com/username
- linkedin.com/company/companyname or linkedin.com/in/username

Website content:
${pageText.substring(0, 20000)}`;

        const response = await axios.post(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            max_tokens: 1000,
            response_format: { type: 'json_object' },
          },
          {
            headers: {
              'Authorization': `Bearer ${openRouterApiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://agent-blueprint-builder.com',
              'X-Title': 'Agent Blueprint Builder',
            },
            timeout: 30000,
          }
        );

        const content = response.data.choices[0].message.content.trim();
        let result = {};
        try {
          result = JSON.parse(content);
        } catch (parseError) {
          const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
          if (jsonMatch) {
            result = JSON.parse(jsonMatch[1]);
          }
        }

        // Validate and add found links
        if (result.facebook && typeof result.facebook === 'string' && result.facebook.startsWith('http') && result.facebook.includes('facebook.com/') && !result.facebook.endsWith('facebook.com') && !result.facebook.endsWith('facebook.com/')) {
          found.facebook = result.facebook.trim();
        }
        if (result.instagram && typeof result.instagram === 'string' && result.instagram.startsWith('http') && result.instagram.includes('instagram.com/') && !result.instagram.endsWith('instagram.com') && !result.instagram.endsWith('instagram.com/')) {
          found.instagram = result.instagram.trim();
        }
        if (result.linkedin && typeof result.linkedin === 'string' && result.linkedin.startsWith('http') && result.linkedin.includes('linkedin.com/') && (result.linkedin.includes('/company/') || result.linkedin.includes('/in/') || result.linkedin.includes('/pub/'))) {
          found.linkedin = result.linkedin.trim();
        }
      }
    } catch (err) {
      // Ignore errors, continue to SERP searches
    }
  }

  // Strategy 2: Targeted SERP searches for each platform (only if not found yet)
  if (businessName && locationCode) {
    const searchQueries = [];
    if (!found.facebook) searchQueries.push({ platform: 'facebook', query: `${businessName} Facebook` });
    if (!found.instagram) searchQueries.push({ platform: 'instagram', query: `${businessName} Instagram` });
    if (!found.linkedin) searchQueries.push({ platform: 'linkedin', query: `${businessName} LinkedIn` });

    for (const { platform, query } of searchQueries) {
      try {
        const serpPayload = [{
          keyword: query,
          location_code: locationCode,
          language_code: langCode,
          depth: 10,
          device: 'desktop',
          os: 'windows',
        }];
        const serpResult = await callDataForSEO('/serp/google/organic/live/advanced', serpPayload);
        
        // Use AI to extract the social link from this targeted SERP
        const systemPrompt = `You are a social media link extractor. Find the ${platform} profile URL for "${businessName}" in this Google search results page. Return only valid JSON with key "${platform}" containing the full URL, or {} if not found.`;
        const userPrompt = `Find the ${platform} profile URL for "${businessName}" in these search results. Return JSON: {"${platform}": "https://..."} or {} if not found.

SERP data:
${JSON.stringify(serpResult, null, 2).substring(0, 30000)}`;

        const response = await axios.post(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            max_tokens: 500,
            response_format: { type: 'json_object' },
          },
          {
            headers: {
              'Authorization': `Bearer ${openRouterApiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://agent-blueprint-builder.com',
              'X-Title': 'Agent Blueprint Builder',
            },
            timeout: 30000,
          }
        );

        const content = response.data.choices[0].message.content.trim();
        let result = {};
        try {
          result = JSON.parse(content);
        } catch (parseError) {
          const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
          if (jsonMatch) {
            result = JSON.parse(jsonMatch[1]);
          }
        }

        // Validate and add
        const url = result[platform];
        if (url && typeof url === 'string' && url.startsWith('http')) {
          if (platform === 'facebook' && url.includes('facebook.com/') && !url.endsWith('facebook.com') && !url.endsWith('facebook.com/')) {
            found.facebook = url.trim();
          } else if (platform === 'instagram' && url.includes('instagram.com/') && !url.endsWith('instagram.com') && !url.endsWith('instagram.com/')) {
            found.instagram = url.trim();
          } else if (platform === 'linkedin' && url.includes('linkedin.com/') && (url.includes('/company/') || url.includes('/in/') || url.includes('/pub/'))) {
            found.linkedin = url.trim();
          }
        }
      } catch (err) {
        // Continue to next platform
      }
    }
  }

  return found;
}

/**
 * Extract business names from FULL SERP using AI (OpenRouter)
 * Analyzes entire SERP JSON structure to find ANY business names
 * @param {any} serpData - Full DataForSEO SERP response
 * @param {string} query - Original search query
 * @param {string} openRouterApiKey - OpenRouter API key
 * @param {string} model - Optional model (defaults to gpt-4o-mini)
 * @returns {Promise<Array<{name: string, source?: string, url?: string, snippet?: string}>>} - Array of candidate business names
 */
async function extractBusinessNamesFromSerp(serpData, query, openRouterApiKey, model = 'openai/gpt-4o-mini') {
  if (!serpData) {
    return [];
  }

  if (!openRouterApiKey) {
    throw new Error('OpenRouter API key required for SERP analysis');
  }

  // Serialize SERP to JSON string, truncate if too large (~50k chars max)
  let serpJson = JSON.stringify(serpData, null, 2);
  if (serpJson.length > 50000) {
    serpJson = serpJson.substring(0, 50000) + '\n... (truncated)';
  }

  const systemPrompt = `You are a business name extractor. Analyze Google SERP (Search Engine Results Page) JSON data and extract ALL business names mentioned anywhere in the results. Be thorough - search through knowledge graphs, organic results, local packs, featured snippets, and any other SERP features. Return only valid JSON, no markdown, no explanations.`;

  const userPrompt = `Analyze this Google SERP JSON data for the query "${query}" and extract ALL business names you find.

Search through knowledge graphs, organic results, local packs, featured snippets, and any other SERP features. Return a JSON object with a "candidates" array. Each candidate must have "name" (exact business name as it appears). Include "url" and "snippet" if available. Deduplicate only if names are EXACTLY the same (case-insensitive). If no business names found, return {"candidates": []}.

SERP JSON data:
${serpJson}`;

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4000, // Increased to handle large candidate lists
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          'Authorization': `Bearer ${openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://agent-blueprint-builder.com',
          'X-Title': 'Agent Blueprint Builder',
        },
        timeout: 30000,
      }
    );

    if (!response.data || !response.data.choices || response.data.choices.length === 0) {
      throw new Error('No response from OpenRouter API');
    }

    const content = response.data.choices[0].message.content.trim();
    
    if (!content) {
      throw new Error('Empty response from OpenRouter API');
    }

    // #region agent log
    try {
      const fs = require('fs');
      const path = require('path');
      const logPath = path.join(__dirname, '..', '.cursor', 'debug.log');
      const logEntry = JSON.stringify({
        sessionId: 'debug-session',
        runId: 'run1',
        location: 'company-scraper-helpers.js:331',
        message: 'AI response received for SERP extraction',
        data: {
          contentLength: content.length,
          contentPreview: content.substring(0, 500),
          contentEnd: content.substring(Math.max(0, content.length - 500)),
          finishReason: response.data.choices[0]?.finish_reason,
        },
        timestamp: Date.now(),
        hypothesisId: 'H1',
      }) + '\n';
      fs.appendFileSync(logPath, logEntry);
    } catch (logError) {
      // Ignore log errors
    }
    // #endregion

    // Parse JSON response
    let result;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      // #region agent log
      try {
        const fs = require('fs');
        const path = require('path');
        const logPath = path.join(__dirname, '..', '.cursor', 'debug.log');
        const logEntry = JSON.stringify({
          sessionId: 'debug-session',
          runId: 'run1',
          location: 'company-scraper-helpers.js:347',
          message: 'JSON parse error - attempting recovery',
          data: {
            parseError: parseError.message,
            contentLength: content.length,
            contentPreview: content.substring(0, 1000),
            contentEnd: content.substring(Math.max(0, content.length - 1000)),
            hasMarkdown: content.includes('```'),
          },
          timestamp: Date.now(),
          hypothesisId: 'H1',
        }) + '\n';
        fs.appendFileSync(logPath, logEntry);
      } catch (logError) {
        // Ignore log errors
      }
      // #endregion

      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[1]);
        } catch (markdownParseError) {
          // Try to fix common JSON issues (unterminated strings, etc.)
          let fixedJson = jsonMatch[1];
          // If JSON ends abruptly, try to close it properly
          if (parseError.message.includes('Unterminated string')) {
            // Find the last complete object/array and truncate there
            const lastCompleteBrace = fixedJson.lastIndexOf('}');
            if (lastCompleteBrace > 0) {
              fixedJson = fixedJson.substring(0, lastCompleteBrace + 1);
              // Try to close the candidates array if needed
              if (!fixedJson.includes('"candidates"')) {
                fixedJson = '{"candidates":[]}';
              } else if (!fixedJson.endsWith(']')) {
                // Try to close the array
                const candidatesStart = fixedJson.indexOf('"candidates":[');
                if (candidatesStart > 0) {
                  const beforeCandidates = fixedJson.substring(0, candidatesStart + 13);
                  fixedJson = beforeCandidates + ']}';
                }
              }
            }
          }
          try {
            result = JSON.parse(fixedJson);
          } catch (recoveryError) {
            console.error('[Company Scraper] Failed to recover JSON, using empty candidates:', recoveryError.message);
            // Return empty candidates as fallback
            return [];
          }
        }
      } else {
        // Try to extract partial JSON if response was truncated
        const jsonStart = content.indexOf('{');
        if (jsonStart >= 0) {
          let partialJson = content.substring(jsonStart);
          // Try to close it properly
          if (!partialJson.endsWith('}')) {
            // Find last complete candidate object
            const lastCompleteCandidate = partialJson.lastIndexOf('}');
            if (lastCompleteCandidate > 0) {
              partialJson = partialJson.substring(0, lastCompleteCandidate + 1);
              // Close candidates array and root object
              if (partialJson.includes('"candidates":[')) {
                partialJson = partialJson.replace(/,\s*$/, '') + ']}';
              }
            } else {
              partialJson = '{"candidates":[]}';
            }
          }
          try {
            result = JSON.parse(partialJson);
          } catch (partialError) {
            console.error('[Company Scraper] Failed to parse partial JSON, using empty candidates:', partialError.message);
            return [];
          }
        } else {
          throw new Error(`Failed to parse AI response as JSON: ${parseError.message}`);
        }
      }
    }

    // Return candidates array, ensure it's an array
    const candidates = result.candidates || [];
    if (!Array.isArray(candidates)) {
      return [];
    }

    // Deduplicate by normalized name (case-insensitive, trim whitespace)
    const seen = new Set();
    const deduplicated = [];
    for (const candidate of candidates) {
      if (!candidate.name || typeof candidate.name !== 'string') continue;
      const normalized = candidate.name.trim().toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        deduplicated.push({
          name: candidate.name.trim(),
          source: candidate.source || 'other',
          url: candidate.url || '',
          snippet: candidate.snippet || '',
        });
      }
    }

    return deduplicated;
  } catch (error) {
    if (error.response) {
      console.error('[Company Scraper] OpenRouter API error (SERP extraction):', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
      });
      throw new Error(`OpenRouter API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

/**
 * Generic AI extractor from JSON data (GMB, Business Listings, etc.)
 * Schema-free: AI returns whatever keys make sense
 * @param {any} rawItem - Raw JSON item to extract from
 * @param {string} context - Context description (e.g. "Google Business / Places", "business listing")
 * @param {string} openRouterApiKey - OpenRouter API key
 * @param {string} model - Optional model (defaults to gpt-4o-mini)
 * @returns {Promise<Object>} - Company info object (flexible blob)
 */
async function extractCompanyFromJsonRaw(rawItem, context, openRouterApiKey, model = 'openai/gpt-4o-mini') {
  if (!rawItem) {
    return {};
  }

  if (!openRouterApiKey) {
    throw new Error('OpenRouter API key required');
  }

  const jsonStr = JSON.stringify(rawItem, null, 2);
  const truncatedJson = jsonStr.length > 30000 ? jsonStr.substring(0, 30000) + '\n... (truncated)' : jsonStr;

  const systemPrompt = `You are a company information extractor. Extract structured company information from JSON data. Return only valid JSON, no markdown, no explanations.`;

  const userPrompt = `From this ${context} JSON, extract all company-related information. Return a single JSON object. Use sensible keys (e.g. businessName, phone, address, workHours, siteUrl, email, city, stateProvince, postalCode, country, facebook, instagram, linkedin, googleMapsLink, etc.). 

CRITICAL: If the JSON contains a Google Maps Places link (maps.app.goo.gl, maps.google.com, g.co/maps, or place_id), include it as "googleMapsLink". If no Google Maps link is found but you have a complete address (street, city, state/province, postal code, country), generate a Google Maps Places link using this format: https://maps.app.goo.gl/[PLACE_ID] or construct a search URL: https://www.google.com/maps/search/?api=1&query=[ENCODED_ADDRESS]. Omit missing fields. Do not invent data.

JSON data:
${truncatedJson}`;

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          'Authorization': `Bearer ${openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://agent-blueprint-builder.com',
          'X-Title': 'Agent Blueprint Builder',
        },
        timeout: 30000,
      }
    );

    if (!response.data || !response.data.choices || response.data.choices.length === 0) {
      throw new Error('No response from OpenRouter API');
    }

    const content = response.data.choices[0].message.content.trim();
    if (!content) {
      throw new Error('Empty response from OpenRouter API');
    }

    let companyData;
    try {
      companyData = JSON.parse(content);
    } catch (parseError) {
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        companyData = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error(`Failed to parse AI response as JSON: ${parseError.message}`);
      }
    }

    if (typeof companyData !== 'object' || companyData === null) {
      return {};
    }
    // Generate Google Maps Places link if address is available but link is missing
    if (!companyData.googleMapsLink && (companyData.address || (companyData.city && companyData.stateProvince))) {
      companyData.googleMapsLink = generateGoogleMapsPlacesLink(companyData);
    }
    return companyData;
  } catch (error) {
    if (error.response) {
      console.error('[Company Scraper] OpenRouter API error (JSON extraction):', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
      });
      throw new Error(`OpenRouter API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

/**
 * Extract company from Google Business / Places raw JSON using AI
 * @param {any} rawGmbItem - Raw GMB result item
 * @param {string} openRouterApiKey - OpenRouter API key
 * @param {string} model - Optional model (defaults to gpt-4o-mini)
 * @returns {Promise<Object>} - Company info object (flexible blob)
 */
async function extractCompanyFromGmbRaw(rawGmbItem, openRouterApiKey, model = 'openai/gpt-4o-mini') {
  return extractCompanyFromJsonRaw(rawGmbItem, 'Google Business / Places', openRouterApiKey, model);
}

/**
 * Extract company from Business Listings raw JSON using AI
 * @param {any} rawItem - Raw Business Listings result item
 * @param {string} openRouterApiKey - OpenRouter API key
 * @param {string} model - Optional model (defaults to gpt-4o-mini)
 * @returns {Promise<Object>} - Company info object (flexible blob)
 */
async function extractCompanyFromBusinessListingsRaw(rawItem, openRouterApiKey, model = 'openai/gpt-4o-mini') {
  return extractCompanyFromJsonRaw(rawItem, 'business listing', openRouterApiKey, model);
}

/**
 * Merge multiple company data blobs into one using AI
 * Prefers non-empty values and resolves conflicts intelligently
 * @param {Array<Object>} blobs - Array of company data objects to merge
 * @param {string} openRouterApiKey - OpenRouter API key
 * @param {string} model - Optional model (defaults to gpt-4o-mini)
 * @param {{ searchQuery?: string, locationName?: string, candidateUrl?: string }} context - Optional search context; prefer data matching query/location/domain
 * @returns {Promise<Object>} - Merged company info object
 */
async function mergeCompanyBlobsWithAI(blobs, openRouterApiKey, model = 'openai/gpt-4o-mini', context = {}) {
  if (!blobs || blobs.length === 0) {
    return {};
  }
  if (blobs.length === 1) {
    return blobs[0] || {};
  }

  if (!openRouterApiKey) {
    throw new Error('OpenRouter API key required');
  }

  const blobsJson = JSON.stringify(blobs, null, 2);
  const truncatedJson = blobsJson.length > 30000 ? blobsJson.substring(0, 30000) + '\n... (truncated)' : blobsJson;

  const systemPrompt = `You are a company data merger. Merge multiple company data objects into one. Return only valid JSON, no markdown, no explanations.`;

  let contextHint = '';
  if (context.searchQuery || context.locationName || context.candidateUrl) {
    contextHint = `\nSearch context: User searched for "${context.searchQuery || ''}" in "${context.locationName || ''}". Candidate URL: ${context.candidateUrl || 'none'}. Prefer data that matches this context (e.g. same location, domain from candidate URL). When the same business name appears in different places, choose the one that matches the search location or candidate domain.\n\n`;
  }

  const userPrompt = `Merge these company data objects into one JSON object. Prefer non-empty values. Resolve conflicts sensibly (e.g. prefer verified/linked source, more complete data). Use consistent keys. 

CRITICAL: Preserve social media links (facebook, instagram, linkedin) and googleMapsLink if present in any blob. If googleMapsLink is missing but address data exists, you can note it but don't generate a placeholder - the system will handle URL generation.

Omit missing fields. Do not invent data. Do not use placeholders like [New X] or YOUR_NEW_X.
${contextHint}Company data objects:
${truncatedJson}`;

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          'Authorization': `Bearer ${openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://agent-blueprint-builder.com',
          'X-Title': 'Agent Blueprint Builder',
        },
        timeout: 30000,
      }
    );

    if (!response.data || !response.data.choices || response.data.choices.length === 0) {
      throw new Error('No response from OpenRouter API');
    }

    const content = response.data.choices[0].message.content.trim();
    if (!content) {
      throw new Error('Empty response from OpenRouter API');
    }

    let mergedData;
    try {
      mergedData = JSON.parse(content);
    } catch (parseError) {
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        mergedData = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error(`Failed to parse AI response as JSON: ${parseError.message}`);
      }
    }

    if (typeof mergedData !== 'object' || mergedData === null) {
      return {};
    }
    // Generate Google Maps Places link if address is available but link is missing
    if (!mergedData.googleMapsLink && (mergedData.address || (mergedData.city && mergedData.stateProvince))) {
      mergedData.googleMapsLink = generateGoogleMapsPlacesLink(mergedData);
    }
    return mergedData;
  } catch (error) {
    if (error.response) {
      console.error('[Company Scraper] OpenRouter API error (merge):', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
      });
      throw new Error(`OpenRouter API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

/**
 * Normalize Business Listings result to company schema
 * Thin normalizer - maps DataForSEO fields to our schema
 * @param {any} item - Business Listings result item
 * @returns {Object} - Normalized company object
 */
function normalizeFromBusinessListings(item) {
  if (!item) {
    return {
      businessName: '',
      email: '',
      phone: '',
      siteUrl: '',
      address: '',
      city: '',
      stateProvince: '',
      postalCode: '',
      country: '',
    };
  }

  // Extract address components (support address, full_address, address_info)
  const address = item.address || item.full_address || (item.address_info && item.address_info.address) || '';
  const addressParts = address.split(',').map(p => p.trim());
  
  // Try to parse address into components (simple heuristic)
  let city = '';
  let stateProvince = '';
  let postalCode = '';
  let country = '';
  
  if (addressParts.length >= 2) {
    // Last part might be country or state
    const lastPart = addressParts[addressParts.length - 1];
    if (lastPart.match(/^\d{5}(-\d{4})?$/)) {
      // US ZIP code
      postalCode = lastPart;
      if (addressParts.length >= 3) {
        stateProvince = addressParts[addressParts.length - 2];
        city = addressParts[addressParts.length - 3];
      }
    } else if (lastPart.length === 2 && lastPart.match(/^[A-Z]{2}$/)) {
      // State abbreviation
      stateProvince = lastPart;
      if (addressParts.length >= 3) {
        city = addressParts[addressParts.length - 2];
        postalCode = addressParts[addressParts.length - 3];
      }
    } else {
      // Assume last is country or state
      country = lastPart;
      if (addressParts.length >= 3) {
        stateProvince = addressParts[addressParts.length - 2];
        city = addressParts[addressParts.length - 3];
      }
    }
  }

  // Extract contacts from contact_info (Business Listings API format)
  const contacts = item.contact_info || [];
  let email = '';
  let phone = '';
  
  for (const contact of contacts) {
    if ((contact.type === 'mail' || contact.type === 'email') && !email) {
      email = contact.value || contact.email || '';
    }
    if ((contact.type === 'telephone' || contact.type === 'phone') && !phone) {
      phone = contact.value || contact.phone || '';
    }
  }
  if (!phone && item.phone) phone = item.phone;
  if (!email && item.email) email = item.email;

  return {
    businessName: item.title || item.name || '',
    email: email,
    phone: phone,
    siteUrl: item.url || item.link || item.website || '',
    address: address,
    city: city,
    stateProvince: stateProvince,
    postalCode: postalCode,
    country: country,
  };
}

/**
 * Format GMB work_hours timetable to human-readable string (e.g. "Mon–Fri 9am–5pm; Sat 10am–2pm; Sun Closed")
 * @param {object} timetable - work_hours.timetable { monday: [{open,close}], ... }
 * @returns {string}
 */
function formatGmbWorkHours(timetable) {
  if (!timetable || typeof timetable !== 'object') return '';
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const labels = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
  const fmt = (h, m) => {
    if (h == null) return '';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const ampm = h < 12 ? 'am' : 'pm';
    const mn = m != null ? `:${String(m).padStart(2, '0')}` : '';
    return `${h12}${mn}${ampm}`;
  };
  const parts = [];
  for (const d of days) {
    const arr = timetable[d];
    if (!Array.isArray(arr) || arr.length === 0) {
      parts.push(`${labels[d]}: Closed`);
      continue;
    }
    const segs = (arr || []).map((slot) => {
      const o = slot && slot.open;
      const c = slot && slot.close;
      if (!o || !c) return '';
      return `${fmt(o.hour, o.minute)}–${fmt(c.hour, c.minute)}`;
    }).filter(Boolean);
    parts.push(`${labels[d]}: ${segs.length ? segs.join(', ') : 'Closed'}`);
  }
  return parts.join('; ');
}

/**
 * Normalize DataForSEO Google My Business Info (GMB) result to company schema
 * @param {any} item - GMB result item (type google_business_info)
 * @returns {Object} - { businessName, email, phone, siteUrl, address, city, stateProvince, postalCode, country, workHours? }
 */
function normalizeFromGmbInfo(item) {
  if (!item) {
    return {
      businessName: '',
      email: '',
      phone: '',
      siteUrl: '',
      address: '',
      city: '',
      stateProvince: '',
      postalCode: '',
      country: '',
      workHours: '',
    };
  }
  const ai = item.address_info || {};
  const addr = item.address || ai.address || '';
  let workHours = '';
  if (item.work_hours && item.work_hours.timetable) {
    workHours = formatGmbWorkHours(item.work_hours.timetable);
  }
  return {
    businessName: item.title || item.original_title || '',
    email: '', // GMB typically doesn't include email
    phone: item.phone || '',
    siteUrl: item.url ? (item.url.startsWith('http') ? item.url : `https://${item.url}`) : '',
    address: addr,
    city: ai.city || '',
    stateProvince: ai.region || '',
    postalCode: ai.zip || '',
    country: ai.country_code || '',
    workHours,
  };
}

module.exports = {
  LOCATION_COORDINATE_MAP,
  getLocationCoordinate,
  getPageTextFromOnPageResult,
  fetchPageTextDirect,
  extractCompanyWithAI,
  extractBusinessNamesFromSerp,
  extractSocialLinksAndMapsFromSerp,
  extractCompanyFromJsonRaw,
  extractCompanyFromGmbRaw,
  extractCompanyFromBusinessListingsRaw,
  extractBusinessNamesFromSerp,
  extractSocialLinksAndMapsFromSerp,
  searchForSocialLinks,
  mergeCompanyBlobsWithAI,
  normalizeFromBusinessListings,
  normalizeFromGmbInfo,
  generateGoogleMapsPlacesLink,
};

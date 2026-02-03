/**
 * Google Search Console Property Utilities
 * Handles property format matching, candidate generation, and URL normalization
 */

const { google } = require('googleapis');
const { authenticateGSC } = require('./gsc-auth');

/**
 * Get all available GSC properties and find matching format
 * Returns the exact property format if found, null otherwise
 */
async function findMatchingGSCProperty(siteUrl) {
  try {
    const authClient = await authenticateGSC(false);
    const searchconsole = google.searchconsole({
      version: 'v1',
      auth: authClient
    });
    
    const response = await searchconsole.sites.list();
    const sites = response.data.siteEntry || [];
    
    // Normalize the input URL for matching
    const normalizedInput = siteUrl.trim().toLowerCase();
    const inputWithoutProtocol = normalizedInput.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const inputDomain = inputWithoutProtocol.split('/')[0];
    const inputDomainNoWww = inputDomain.replace(/^www\./, '');
    
    // #region agent log
    fetch('http://127.0.0.1:7252/ingest/bab6957c-2bf9-434e-a543-29f3beb37d51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gsc-property-utils.js:42',message:'Searching for matching GSC property',data:{siteUrl,inputDomain,inputDomainNoWww,availableSites:sites.map(s=>s.siteUrl)},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H'})}).catch(()=>{});
    // #endregion
    
    // Try to find a matching property
    for (const site of sites) {
      const propertyUrl = site.siteUrl.toLowerCase();
      let propertyDomain = '';
      
      // Handle sc-domain: format
      if (propertyUrl.startsWith('sc-domain:')) {
        propertyDomain = propertyUrl.replace(/^sc-domain:/, '').split('/')[0];
      } else {
        // Handle URL prefix format
        propertyDomain = propertyUrl.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0];
      }
      
      const propertyDomainNoWww = propertyDomain.replace(/^www\./, '');
      
      // Match by domain (with or without www)
      if (propertyDomainNoWww === inputDomainNoWww) {
        // #region agent log
        fetch('http://127.0.0.1:7252/ingest/bab6957c-2bf9-434e-a543-29f3beb37d51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gsc-property-utils.js:72',message:'Found matching GSC property',data:{siteUrl,matchedProperty:site.siteUrl,permissionLevel:site.permissionLevel,matchedDomain:propertyDomainNoWww,isScDomain:propertyUrl.startsWith('sc-domain:')},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'I'})}).catch(()=>{});
        // #endregion
        
        return site.siteUrl; // Return the exact format from GSC
      }
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7252/ingest/bab6957c-2bf9-434e-a543-29f3beb37d51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gsc-property-utils.js:68',message:'No matching GSC property found in list',data:{siteUrl,inputDomain,inputDomainNoWww,availableProperties:sites.map(s=>s.siteUrl)},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H'})}).catch(()=>{});
    // #endregion
    return null;
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7252/ingest/bab6957c-2bf9-434e-a543-29f3beb37d51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gsc-property-utils.js:73',message:'Error finding matching GSC property',data:{siteUrl,error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H'})}).catch(()=>{});
    // #endregion
    console.error('[GSC] Error finding matching property:', error);
    return null;
  }
}

/**
 * Generate property format candidates
 * Returns array of property formats to try, in order of preference
 */
function generatePropertyCandidates(siteUrl) {
  try {
    const candidates = [];
    
    // Normalize the URL
    let url = siteUrl.trim();
    
    // Ensure URL has protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7252/ingest/bab6957c-2bf9-434e-a543-29f3beb37d51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gsc-property-utils.js:40',message:'Generating property candidates',data:{originalSiteUrl:siteUrl,normalizedUrl:url},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // Candidate 1: URL prefix format (with trailing slash)
    // This is the most common format for verified properties
    const urlPrefixWithSlash = url.endsWith('/') ? url : `${url}/`;
    candidates.push(urlPrefixWithSlash);
    
    // Candidate 2: URL prefix format (without trailing slash)
    // Some properties are registered without trailing slash
    const urlPrefixWithoutSlash = url.endsWith('/') ? url.slice(0, -1) : url;
    if (urlPrefixWithoutSlash !== urlPrefixWithSlash) {
      candidates.push(urlPrefixWithoutSlash);
    }
    
    // Candidate 3: sc-domain format
    // Extract domain from URL
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      candidates.push(`sc-domain:${domain}`);
      
      // Candidate 4: Try www variant if domain doesn't have www
      if (!domain.startsWith('www.')) {
        candidates.push(`sc-domain:www.${domain}`);
        candidates.push(`https://www.${domain}/`);
        candidates.push(`https://www.${domain}`);
      } else {
        // If it has www, try without www
        const domainWithoutWww = domain.replace(/^www\./, '');
        candidates.push(`sc-domain:${domainWithoutWww}`);
        candidates.push(`https://${domainWithoutWww}/`);
        candidates.push(`https://${domainWithoutWww}`);
      }
      
      // Candidate 5: Try http variant (if original was https)
      if (url.startsWith('https://')) {
        const httpUrl = url.replace('https://', 'http://');
        candidates.push(httpUrl.endsWith('/') ? httpUrl : `${httpUrl}/`);
        candidates.push(httpUrl.endsWith('/') ? httpUrl.slice(0, -1) : httpUrl);
      }
    } catch (e) {
      // If URL parsing fails, try simple extraction
      const domain = url.replace(/^https?:\/\//, '').split('/')[0];
      if (domain) {
        candidates.push(`sc-domain:${domain}`);
      }
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7252/ingest/bab6957c-2bf9-434e-a543-29f3beb37d51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gsc-property-utils.js:78',message:'Property candidates generated',data:{candidates,candidatesCount:candidates.length,originalSiteUrl:siteUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    return candidates;
  } catch (error) {
    console.error('[GSC] Error generating property candidates:', error);
    // #region agent log
    fetch('http://127.0.0.1:7252/ingest/bab6957c-2bf9-434e-a543-29f3beb37d51',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gsc-property-utils.js:85',message:'Error generating candidates - using fallback',data:{error:error.message,fallbackSiteUrl:siteUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    // Fallback: return the original URL as-is
    return [siteUrl];
  }
}

/**
 * Normalize GSC site URL to standard https:// format
 * Handles sc-domain:, http://, https://, and plain domain formats
 * Always returns https://domain.com/ format
 */
function normalizeGSCSiteUrl(siteUrl) {
  if (!siteUrl || typeof siteUrl !== 'string') {
    return '';
  }
  
  // Trim whitespace
  let normalized = siteUrl.trim();
  const original = normalized;
  
  // Handle sc-domain: format FIRST (case-insensitive, with or without whitespace)
  // Check if it starts with sc-domain (case-insensitive)
  if (/^sc-domain\s*:/i.test(normalized)) {
    // Extract domain after sc-domain:
    normalized = normalized.replace(/^sc-domain\s*:\s*/i, '');
    console.log(`[GSC Normalize] Detected sc-domain format, extracted: "${normalized}"`);
  }
  
  // Remove any existing protocol (http:// or https://)
  normalized = normalized.replace(/^https?:\/\//i, '');
  
  // Remove any leading/trailing slashes and get just the domain
  normalized = normalized.replace(/^\/+|\/+$/g, '');
  
  // Extract just the domain (remove any path, query string, fragment)
  const domain = normalized.split('/')[0].split('?')[0].split('#')[0].trim();
  
  // Ensure we have a domain
  if (!domain) {
    console.warn(`[GSC Normalize] Could not extract domain from: "${original}"`);
    return original;
  }
  
  // Always return https://domain/ format
  const result = `https://${domain}/`;
  console.log(`[GSC Normalize] Final result: "${original}" → "${result}"`);
  return result;
}

module.exports = {
  findMatchingGSCProperty,
  generatePropertyCandidates,
  normalizeGSCSiteUrl
};





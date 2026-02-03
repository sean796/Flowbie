/**
 * Shared utilities for WordPress routes
 */

const fs = require('fs');
const path = require('path');

// Debug log path (relative to project root)
const DEBUG_LOG_PATH = path.join(__dirname, '..', '..', '.cursor', 'debug.log');

/**
 * Ensure debug log directory exists
 */
function ensureDebugLogDir() {
  try {
    const logDir = path.dirname(DEBUG_LOG_PATH);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  } catch (e) {
    // Silently fail if directory creation fails
  }
}

/**
 * Normalize WordPress site URL
 * Ensures URL has protocol and no trailing slash
 */
function normalizeUrl(siteUrl) {
  let normalizedUrl = siteUrl.trim();
  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = 'https://' + normalizedUrl;
  }
  normalizedUrl = normalizedUrl.replace(/\/$/, '');
  return normalizedUrl;
}

/**
 * Get WordPress REST API endpoint name from post type
 * WordPress REST API requires plural endpoints: 'post' -> 'posts', 'page' -> 'pages'
 */
function getRestEndpoint(postType) {
  const REST_ENDPOINT_MAP = {
    'post': 'posts',
    'page': 'pages',
    'posts': 'posts', // Handle case where it's already plural
    'pages': 'pages',  // Handle case where it's already plural
  };
  
  const normalizedPostType = (postType || 'post').toLowerCase();
  const endpointName = REST_ENDPOINT_MAP[normalizedPostType] || postType;
  
  // Final safety check - if somehow we still have 'post', force it to 'posts'
  // For custom post types, use entity endpoint extraction pattern (not hardcoded here)
  return endpointName === 'post' ? 'posts' : endpointName;
}

/**
 * Extract slug from URL
 * Handles various URL formats and removes file extensions
 */
function extractSlug(urlStr) {
  try {
    const urlObj = new URL(urlStr);
    const pathname = urlObj.pathname.replace(/\/$/, '');
    const slug = pathname.split('/').pop() || '';
    // Remove file extensions if present
    const finalSlug = slug.replace(/\.(html?|php)$/i, '');
    // #region agent log
    try { 
      ensureDebugLogDir();
      fs.appendFileSync(DEBUG_LOG_PATH, JSON.stringify({
        location: 'wordpress/utils.js:extractSlug',
        message: 'extractSlug function - slug extracted',
        data: {
          urlStr,
          pathname,
          slug,
          finalSlug,
          urlObjHref: urlObj.href,
          urlObjPathname: urlObj.pathname,
          urlObjSearch: urlObj.search,
          urlObjHash: urlObj.hash
        },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'initial',
        hypothesisId: 'D'
      }) + '\n'); 
    } catch(e) {}
    // #endregion
    return finalSlug;
  } catch (error) {
    // If URL parsing fails, try to extract from string
    const parts = urlStr.replace(/\/$/, '').split('/');
    const fallbackSlug = parts[parts.length - 1]?.replace(/\.(html?|php)$/i, '') || '';
    // #region agent log
    try { 
      ensureDebugLogDir();
      fs.appendFileSync(DEBUG_LOG_PATH, JSON.stringify({
        location: 'wordpress/utils.js:extractSlug',
        message: 'extractSlug function - fallback extraction',
        data: {
          urlStr,
          error: error.message,
          fallbackSlug,
          parts
        },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'initial',
        hypothesisId: 'E'
      }) + '\n'); 
    } catch(e) {}
    // #endregion
    return fallbackSlug;
  }
}

/**
 * Get standard auth configuration for WordPress API requests
 */
function getAuthConfig(username, appPassword, options = {}) {
  return {
    auth: {
      username: username,
      password: appPassword
    },
    headers: {
      'Content-Type': options.contentType || 'application/json',
      'Accept': options.accept || 'application/json',
      'User-Agent': 'WordPress-Integration/1.0'
    },
    timeout: options.timeout || 10000,
    validateStatus: options.validateStatus || ((status) => status < 500),
    ...options.extra
  };
}

/**
 * Log data to debug log file
 */
function logToDebug(data, location = 'wordpress/utils.js') {
  try {
    ensureDebugLogDir();
    fs.appendFileSync(DEBUG_LOG_PATH, JSON.stringify({
      location,
      ...data,
      timestamp: Date.now(),
      sessionId: data.sessionId || 'debug-session',
      runId: data.runId || 'initial',
      hypothesisId: data.hypothesisId || 'A'
    }) + '\n');
  } catch(e) {
    // Silently fail if logging fails
  }
}

module.exports = {
  DEBUG_LOG_PATH,
  normalizeUrl,
  getRestEndpoint,
  extractSlug,
  getAuthConfig,
  logToDebug
};




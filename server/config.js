/**
 * Configuration and utility functions for DataForSEO API
 */

// DataForSEO credentials - from env only (never commit secrets)
const DATAFORSEO_CREDENTIALS = {
  api_login: process.env.DATAFORSEO_API_LOGIN || '',
  api_password: process.env.DATAFORSEO_API_PASSWORD || ''
};

const DATAFORSEO_API_BASE = 'https://api.dataforseo.com/v3';

// Create base64 auth - MUST be continuous with no spaces or newlines
const auth = Buffer.from(`${DATAFORSEO_CREDENTIALS.api_login}:${DATAFORSEO_CREDENTIALS.api_password}`).toString('base64');

// Location and language mappings
const LOCATION_MAP = {
  'United States': 2840,
  'United Kingdom': 2826,
  'Canada': 2124,
  'Australia': 2036,
};

// Legacy numeric language codes (NOT USED - kept for reference only)
// DataForSEO Labs endpoints require string ISO codes (e.g., "en"), not numeric
const LANGUAGE_MAP_LEGACY = {
  'en': 1000,
  'es': 1014,
  'fr': 1015,
  'de': 1011,
};

/**
 * Ensures language_code is a string ISO code (e.g., "en")
 * Converts numeric legacy codes to ISO strings if needed
 */
function ensureLanguageCode(lang) {
  // If already a string, return it
  if (typeof lang === 'string') {
    return lang;
  }
  
  // If numeric, map to ISO string (legacy support)
  if (typeof lang === 'number') {
    const legacyToIso = {
      1000: 'en',
      1014: 'es',
      1015: 'fr',
      1011: 'de',
    };
    return legacyToIso[lang] || String(lang);
  }
  
  // Default to English
  return 'en';
}

/**
 * Recursively removes 'language_name' field from any object or array
 * This ensures DataForSEO API never receives this invalid field
 * @param {any} obj - The object or array to sanitize
 * @returns {any} - Sanitized object/array with language_name removed
 */
function sanitizeDataForSEOPayload(obj) {
  // Handle null/undefined
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  // Handle arrays - recursively sanitize each element
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeDataForSEOPayload(item));
  }
  
  // Handle objects - remove language_name and recursively sanitize nested objects
  if (typeof obj === 'object') {
    const sanitized = {};
    // Use Object.keys to avoid prototype chain issues
    for (const key of Object.keys(obj)) {
      // Skip language_name field completely
      if (key === 'language_name') {
        continue;
      }
      
      // Recursively sanitize nested objects/arrays
      sanitized[key] = sanitizeDataForSEOPayload(obj[key]);
    }
    return sanitized;
  }
  
  // Primitive values pass through unchanged
  return obj;
}

/**
 * Deep recursive check for a key anywhere in an object/array structure
 * @param {any} obj - The object or array to search
 * @param {string} keyToFind - The key to search for
 * @returns {boolean} - True if key is found anywhere in the structure
 */
function containsKeyDeep(obj, keyToFind) {
  if (obj === null || obj === undefined) return false;
  
  // Check if object has the key as own property
  if (typeof obj === 'object' && !Array.isArray(obj)) {
    if (Object.prototype.hasOwnProperty.call(obj, keyToFind)) {
      return true;
    }
  }
  
  // Recursively check arrays
  if (Array.isArray(obj)) {
    return obj.some(item => containsKeyDeep(item, keyToFind));
  }
  
  // Recursively check object values
  if (typeof obj === 'object') {
    return Object.values(obj).some(v => containsKeyDeep(v, keyToFind));
  }
  
  return false;
}

module.exports = {
  DATAFORSEO_CREDENTIALS,
  DATAFORSEO_API_BASE,
  auth,
  LOCATION_MAP,
  LANGUAGE_MAP_LEGACY,
  ensureLanguageCode,
  sanitizeDataForSEOPayload,
  containsKeyDeep
};


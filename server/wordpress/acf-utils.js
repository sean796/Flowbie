/**
 * ACF (Advanced Custom Fields) Utilities
 * Simplified utilities for ACF REST API validation and field serialization
 * 
 * CORRECT APPROACH: Use `acf` object on standard WP REST endpoint
 * - Read: GET /wp-json/wp/v2/{post_type}/{id}?context=edit → response.acf
 * - Write: POST /wp-json/wp/v2/{post_type}/{id} with { acf: { field: value } }
 */

const axios = require('axios');
const { normalizeUrl, getRestEndpoint, getAuthConfig } = require('./utils');

/**
 * Validate ACF REST API setup
 * Checks if the acf object is available in the REST response
 * 
 * @param {string} siteUrl - WordPress site URL
 * @param {string} username - WordPress username
 * @param {string} appPassword - Application password
 * @param {string} postType - Post type (default: 'post')
 * @param {string} postTypeEndpoint - Optional exact endpoint name
 * @param {number} postId - Optional post ID to check specific post
 * @returns {Promise<Object>} Validation result
 */
async function validateACFSetup(siteUrl, username, appPassword, postType = 'post', postTypeEndpoint = null, postId = null) {
  const normalizedUrl = normalizeUrl(siteUrl);
  const finalEndpointName = postTypeEndpoint || getRestEndpoint(postType);
  const authConfig = getAuthConfig(username, appPassword, { timeout: 10000 });

  const result = {
    hasAcfSupport: false,
    acfFields: {},
    postTypeEndpoint: finalEndpointName,
    hasPermission: false,
    errors: [],
    warnings: []
  };

  try {
    // If we have a specific post ID, check that post directly
    if (postId) {
      const postUrl = `${normalizedUrl}/wp-json/wp/v2/${finalEndpointName}/${postId}?context=edit`;
      
      try {
        const postResponse = await axios.get(postUrl, authConfig);
        
        if (postResponse.status === 200) {
          result.hasPermission = true;
          
          if (postResponse.data.acf !== undefined) {
            result.hasAcfSupport = true;
            result.acfFields = postResponse.data.acf || {};
            console.log(`[ACF Utils] ACF support confirmed for post ${postId}. Fields: ${Object.keys(result.acfFields).join(', ') || 'none'}`);
          } else {
            result.errors.push('ACF object not found in REST response. Check functions.php configuration.');
          }
        }
      } catch (postError) {
        if (postError.response?.status === 401 || postError.response?.status === 403) {
          result.errors.push('Permission denied. Check username and application password.');
        } else if (postError.response?.status === 404) {
          result.errors.push(`Post ${postId} not found in ${finalEndpointName} endpoint.`);
        } else {
          result.errors.push(`Failed to fetch post: ${postError.message}`);
        }
      }
    } else {
      // Check post type endpoint without specific post
      const listUrl = `${normalizedUrl}/wp-json/wp/v2/${finalEndpointName}?per_page=1&context=edit`;
      
      try {
        const listResponse = await axios.get(listUrl, authConfig);
        
        if (listResponse.status === 200) {
          result.hasPermission = true;
          
          // Check if any post has acf object
          if (Array.isArray(listResponse.data) && listResponse.data.length > 0) {
            const samplePost = listResponse.data[0];
            
            if (samplePost.acf !== undefined) {
              result.hasAcfSupport = true;
              result.acfFields = samplePost.acf || {};
              console.log(`[ACF Utils] ACF support confirmed for ${finalEndpointName}. Sample fields: ${Object.keys(result.acfFields).join(', ') || 'none'}`);
            } else {
              result.errors.push('ACF object not found in REST response. Check functions.php configuration.');
            }
          } else {
            result.warnings.push(`No posts found in ${finalEndpointName}. Cannot verify ACF support.`);
            // Assume ACF might be available, let the actual update verify
            result.hasAcfSupport = true;
          }
        }
      } catch (listError) {
        if (listError.response?.status === 401 || listError.response?.status === 403) {
          result.errors.push('Permission denied. Check username and application password.');
        } else {
          result.errors.push(`Failed to access ${finalEndpointName}: ${listError.message}`);
        }
      }
    }

    // Add helpful messages
    if (!result.hasAcfSupport && result.errors.length === 0) {
      result.errors.push('ACF REST API not properly configured.');
      result.warnings.push('Required in functions.php: add_filter("acf/rest_api/field_settings/show_in_rest", "__return_true");');
      result.warnings.push('Required in functions.php: add_filter("acf/rest_api/field_settings/editable", "__return_true");');
    }

  } catch (error) {
    result.errors.push(`Validation failed: ${error.message}`);
  }

  return result;
}

/**
 * Check if a specific ACF field exists on a post
 * 
 * @param {string} siteUrl - WordPress site URL
 * @param {string} username - WordPress username
 * @param {string} appPassword - Application password
 * @param {number} postId - Post ID
 * @param {string} fieldName - Field name to check
 * @param {string} postType - Post type (default: 'post')
 * @param {string} postTypeEndpoint - Optional exact endpoint name
 * @returns {Promise<Object>} Field check result
 */
async function checkACFFieldExists(siteUrl, username, appPassword, postId, fieldName, postType = 'post', postTypeEndpoint = null) {
  const normalizedUrl = normalizeUrl(siteUrl);
  const finalEndpointName = postTypeEndpoint || getRestEndpoint(postType);
  const authConfig = getAuthConfig(username, appPassword, { timeout: 10000 });

  const result = {
    found: false,
    currentValue: null,
    allFields: [],
    error: null
  };

  try {
    const url = `${normalizedUrl}/wp-json/wp/v2/${finalEndpointName}/${postId}?context=edit`;
    const response = await axios.get(url, authConfig);

    if (response.status === 200 && response.data.acf !== undefined) {
      const acfFields = response.data.acf || {};
      result.allFields = Object.keys(acfFields);
      
      if (fieldName in acfFields) {
        result.found = true;
        result.currentValue = acfFields[fieldName];
      } else {
        // Field not in current values, but might still be a valid ACF field
        // ACF fields can be empty/null initially
        result.found = false;
        result.error = `Field "${fieldName}" not found. Available fields: ${result.allFields.join(', ') || 'none'}`;
      }
    } else {
      result.error = 'ACF object not found in response. Check ACF REST API configuration.';
    }
  } catch (error) {
    result.error = error.response?.data?.message || error.message;
  }

  return result;
}

/**
 * Serialize ACF field value for REST API
 * Handles different value types appropriately
 * 
 * @param {*} value - Field value
 * @param {string} fieldType - Optional ACF field type hint
 * @returns {*} Serialized value
 */
function serializeACFFieldValue(value, fieldType = null) {
  if (value === null || value === undefined) {
    return '';
  }

  // If fieldType is provided, use type-specific serialization
  if (fieldType) {
    switch (fieldType) {
      case 'repeater':
      case 'flexible_content':
        return Array.isArray(value) ? value : [];
      
      case 'group':
        return typeof value === 'object' && !Array.isArray(value) ? value : {};
      
      case 'gallery':
      case 'relationship':
      case 'taxonomy':
        if (Array.isArray(value)) {
          return value.map(v => typeof v === 'object' && v.id ? v.id : v);
        }
        return [];
      
      case 'true_false':
        return value === true || value === 'true' || value === 1 || value === '1';
      
      case 'number':
      case 'range':
        const num = Number(value);
        return isNaN(num) ? 0 : num;
      
      case 'checkbox':
        return Array.isArray(value) ? value : (value ? [value] : []);
    }
  }

  // Auto-detect type based on value
  if (typeof value === 'boolean') {
    return value;
  }
  
  if (typeof value === 'number') {
    return value;
  }
  
  if (Array.isArray(value)) {
    return value;
  }
  
  if (typeof value === 'object' && value !== null) {
    return value;
  }

  // Default: convert to string
  return String(value);
}

/**
 * Deserialize ACF field value from REST API response
 * 
 * @param {*} value - Stored value
 * @param {string} fieldType - ACF field type
 * @returns {*} Deserialized value
 */
function deserializeACFFieldValue(value, fieldType) {
  if (value === null || value === undefined || value === '') {
    // Return appropriate empty value based on type
    switch (fieldType) {
      case 'repeater':
      case 'flexible_content':
      case 'gallery':
      case 'relationship':
      case 'taxonomy':
      case 'checkbox':
        return [];
      case 'group':
        return {};
      case 'true_false':
        return false;
      case 'number':
      case 'range':
        return 0;
      default:
        return '';
    }
  }

  // Value exists, return as-is (REST API should return proper types)
  return value;
}

module.exports = {
  validateACFSetup,
  checkACFFieldExists,
  serializeACFFieldValue,
  deserializeACFFieldValue
};

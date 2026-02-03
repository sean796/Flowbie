/**
 * ACF Options Page Field Structure Importer
 * Import ACF Options Page field structure from template site to new site
 * Only imports field definitions, not data values
 */

const axios = require('axios');
const { normalizeUrl, getAuthConfig } = require('./utils');

/**
 * Get ACF Options Page field structure from template site
 * Uses existing get-acf-options-page-fields endpoint pattern
 * @param {string} siteUrl - Template site URL
 * @param {string} username - WordPress username
 * @param {string} appPassword - Application password
 * @param {string} pageSlug - Options page slug (default: 'options')
 * @returns {Promise<object>} Field structure
 */
async function getFieldStructure(siteUrl, username, appPassword, pageSlug = 'options') {
  try {
    const normalizedUrl = normalizeUrl(siteUrl);
    const authConfig = getAuthConfig(username, appPassword, { timeout: 30000 });

    // Use ACF v3 Options endpoint to get field structure
    const url = `${normalizedUrl}/wp-json/acf/v3/options/options`;
    
    try {
      const response = await axios.get(url, authConfig);
      
      if (response.status === 200 && response.data) {
        // Extract field structure from response
        // ACF v3 returns fields directly at root level
        const fields = response.data || {};
        
        // Convert to field structure format (field definitions only, not values)
        const fieldStructure = {};
        
        for (const [fieldName, fieldValue] of Object.entries(fields)) {
          // Infer field type from value
          const fieldType = inferFieldType(fieldValue);
          
          fieldStructure[fieldName] = {
            name: fieldName,
            type: fieldType,
            // Store structure, not value
            structure: getFieldStructureFromValue(fieldValue)
          };
        }

        return {
          success: true,
          fields: fieldStructure,
          pageSlug,
          count: Object.keys(fieldStructure).length
        };
      }
    } catch (endpointError) {
      if (endpointError.response) {
        const status = endpointError.response.status;
        
        if (status === 404) {
          return {
            success: false,
            error: 'ACF Options Page endpoint not found. Ensure ACF REST API is configured.',
            hint: 'Add ACF REST API filters to functions.php'
          };
        } else if (status === 401 || status === 403) {
          return {
            success: false,
            error: 'Authentication failed. Check your Application Password.'
          };
        } else {
          return {
            success: false,
            error: `HTTP ${status}: ${endpointError.response.statusText}`
          };
        }
      }
      
      return {
        success: false,
        error: endpointError.message || 'Failed to get field structure'
      };
    }
  } catch (error) {
    console.error('[Field Structure Importer] Get field structure error:', error);
    return {
      success: false,
      error: error.message || 'Failed to get field structure'
    };
  }
}

/**
 * Import field structure to new site
 * Sets up ACF Options Page field structure (definitions only, not data values)
 * @param {string} siteUrl - Target site URL
 * @param {string} username - WordPress username
 * @param {string} appPassword - Application password
 * @param {object} fieldStructure - Field structure to import
 * @param {string} pageSlug - Options page slug
 * @returns {Promise<object>} Import result
 */
async function importFieldStructure(siteUrl, username, appPassword, fieldStructure, pageSlug = 'options') {
  try {
    const normalizedUrl = normalizeUrl(siteUrl);
    const authConfig = getAuthConfig(username, appPassword, { timeout: 30000 });

    // ACF Options Page fields are typically set via ACF REST API
    // We'll use the ACF v3 options endpoint to set up the structure
    // Note: This sets up the fields with empty/default values
    const url = `${normalizedUrl}/wp-json/acf/v3/options/options`;
    
    // Prepare field data with empty values matching the structure
    const fieldData = {};
    for (const [fieldName, fieldDef] of Object.entries(fieldStructure)) {
      // Set empty value based on field type
      fieldData[fieldName] = getDefaultValueForType(fieldDef.type, fieldDef.structure);
    }

    try {
      // POST to set the field structure (ACF will create fields if they don't exist)
      const response = await axios.post(url, fieldData, authConfig);
      
      if (response.status === 200 || response.status === 201) {
        return {
          success: true,
          importedFields: Object.keys(fieldStructure),
          count: Object.keys(fieldStructure).length,
          message: 'Field structure imported successfully'
        };
      }
    } catch (endpointError) {
      if (endpointError.response) {
        const status = endpointError.response.status;
        
        if (status === 404) {
          return {
            success: false,
            error: 'ACF Options Page endpoint not found. Ensure ACF REST API is configured on target site.',
            hint: 'Add ACF REST API filters to functions.php'
          };
        } else if (status === 401 || status === 403) {
          return {
            success: false,
            error: 'Authentication failed. Check your Application Password.'
          };
        } else {
          return {
            success: false,
            error: `HTTP ${status}: ${endpointError.response.statusText}`,
            details: endpointError.response.data
          };
        }
      }
      
      return {
        success: false,
        error: endpointError.message || 'Failed to import field structure'
      };
    }
  } catch (error) {
    console.error('[Field Structure Importer] Import field structure error:', error);
    return {
      success: false,
      error: error.message || 'Failed to import field structure'
    };
  }
}

/**
 * Infer field type from value
 */
function inferFieldType(value) {
  if (value === null || value === undefined) return 'text';
  if (typeof value === 'boolean') return 'true_false';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === 'object') return 'repeater';
    return 'select';
  }
  if (typeof value === 'object') return 'group';
  if (typeof value === 'string') {
    if (/^#?[0-9a-fA-F]{3,6}$/i.test(value)) return 'color_picker';
    if (/^https?:\/\//.test(value)) return 'url';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'email';
    return 'text';
  }
  return 'text';
}

/**
 * Get field structure from value (for nested fields)
 */
function getFieldStructureFromValue(value) {
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
    // Repeater field - return structure of first item
    return getFieldStructureFromValue(value[0]);
  }
  if (typeof value === 'object' && value !== null) {
    // Group field - return structure of nested fields
    const structure = {};
    for (const [key, val] of Object.entries(value)) {
      structure[key] = {
        type: inferFieldType(val),
        structure: getFieldStructureFromValue(val)
      };
    }
    return structure;
  }
  return null;
}

/**
 * Get default value for field type
 */
function getDefaultValueForType(type, structure) {
  switch (type) {
    case 'true_false':
      return false;
    case 'number':
      return 0;
    case 'select':
    case 'checkbox':
      return [];
    case 'repeater':
      return [];
    case 'group':
      if (structure) {
        const groupValue = {};
        for (const [key, fieldDef] of Object.entries(structure)) {
          groupValue[key] = getDefaultValueForType(fieldDef.type, fieldDef.structure);
        }
        return groupValue;
      }
      return {};
    case 'color_picker':
      return '#000000';
    case 'url':
      return '';
    case 'email':
      return '';
    default:
      return '';
  }
}

module.exports = {
  getFieldStructure,
  importFieldStructure
};

/**
 * ACF Options Page Customization Injector
 * AI-powered field mapping and injection using OpenRouter API
 */

const axios = require('axios');
const { normalizeUrl, getAuthConfig } = require('./utils');
const { updateACFFields } = require('./acf-protocol');

/**
 * Map client data to ACF field structure using AI
 * This function should be called from frontend with streamChatCompletion
 * Backend provides the mapping logic structure
 * 
 * @param {object} fieldsStructure - ACF Options Page field structure
 * @param {object} clientData - Client data to map
 * @returns {object} Mapping instructions for AI prompt
 */
function getFieldMappingPrompt(fieldsStructure, clientData) {
  const systemPrompt = `You are a WordPress ACF Options Page specialist. Analyze the following ACF field structure and map the provided client data to the appropriate fields.

CRITICAL REQUIREMENTS:
- Return ONLY valid JSON, no markdown code blocks
- Preserve exact field structure and data types
- Map colors to theme-compatible formats (hex codes)
- Structure NAP data according to existing patterns
- Handle nested fields (groups, repeaters) correctly
- If a field doesn't match client data, leave it empty or use a sensible default`;

  const userPrompt = `ACF Fields Structure:
${JSON.stringify(fieldsStructure, null, 2)}

Discovered Client Data:
- Business Name: ${clientData.businessName || 'N/A'}
- Primary Color: ${clientData.primaryColor || 'N/A'}
- Secondary Color: ${clientData.secondaryColor || 'N/A'}
- Accent Color: ${clientData.accentColor || 'N/A'}
- Email: ${clientData.email || 'N/A'}
- Phone: ${clientData.phone || 'N/A'}
- Address: ${clientData.address || 'N/A'}
- Site URL: ${clientData.siteUrl || 'N/A'}
- NAP Data: ${JSON.stringify(clientData.napData || {}, null, 2)}
- Locations: ${JSON.stringify(clientData.locations || [], null, 2)}
- Additional Data: ${JSON.stringify(clientData.additionalData || {}, null, 2)}

Map the client data to ACF fields. Return ONLY the JSON object matching the field structure. Do not include explanations or markdown.`;

  return {
    systemPrompt,
    userPrompt,
    temperature: 0.2,
    maxTokens: 8000
  };
}

/**
 * Inject client data into ACF Options Page
 * Uses existing update-acf-fields endpoint pattern
 * @param {string} siteUrl - Target site URL
 * @param {string} username - WordPress username
 * @param {string} appPassword - Application password
 * @param {object} mappedFields - Mapped field data (from AI)
 * @param {string} pageSlug - Options page slug (default: 'options')
 * @returns {Promise<object>} Injection result
 */
async function injectClientData(siteUrl, username, appPassword, mappedFields, pageSlug = 'options') {
  try {
    const normalizedUrl = normalizeUrl(siteUrl);
    const authConfig = getAuthConfig(username, appPassword, { timeout: 30000 });

    // ACF Options Page is typically accessed via post ID 0 or a specific options post
    // We'll use the ACF v3 options endpoint
    const url = `${normalizedUrl}/wp-json/acf/v3/options/options`;
    
    try {
      // Update ACF Options Page fields
      const response = await axios.post(url, mappedFields, authConfig);
      
      if (response.status === 200 || response.status === 201) {
        return {
          success: true,
          updatedFields: Object.keys(mappedFields),
          count: Object.keys(mappedFields).length,
          message: 'Client data injected successfully'
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
            error: `HTTP ${status}: ${endpointError.response.statusText}`,
            details: endpointError.response.data
          };
        }
      }
      
      return {
        success: false,
        error: endpointError.message || 'Failed to inject client data'
      };
    }
  } catch (error) {
    console.error('[Options Injector] Inject client data error:', error);
    return {
      success: false,
      error: error.message || 'Failed to inject client data'
    };
  }
}

/**
 * Validate mapped fields against field structure
 * @param {object} mappedFields - Mapped field data
 * @param {object} fieldStructure - Original field structure
 * @returns {object} Validation result
 */
function validateMappedFields(mappedFields, fieldStructure) {
  const errors = [];
  const warnings = [];

  for (const [fieldName, fieldDef] of Object.entries(fieldStructure)) {
    if (!(fieldName in mappedFields)) {
      warnings.push(`Field "${fieldName}" not mapped`);
    } else {
      // Type validation could be added here
      const mappedValue = mappedFields[fieldName];
      const expectedType = fieldDef.type;
      
      // Basic type checking
      if (expectedType === 'number' && typeof mappedValue !== 'number') {
        errors.push(`Field "${fieldName}" should be a number, got ${typeof mappedValue}`);
      } else if (expectedType === 'true_false' && typeof mappedValue !== 'boolean') {
        errors.push(`Field "${fieldName}" should be a boolean, got ${typeof mappedValue}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Clean and parse AI-generated JSON response
 * Removes markdown code blocks and validates JSON
 * @param {string} aiResponse - Raw AI response
 * @returns {object} Parsed JSON or error
 */
function parseAIResponse(aiResponse) {
  try {
    let cleaned = aiResponse.trim();
    
    // Remove markdown code blocks
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/i, '').replace(/\s*```$/i, '');
    }
    
    // Extract JSON object if wrapped in text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    
    // Validate JSON completeness
    const bracketBalance = (cleaned.match(/\{/g) || []).length - (cleaned.match(/\}/g) || []).length;
    const arrayBalance = (cleaned.match(/\[/g) || []).length - (cleaned.match(/\]/g) || []).length;
    
    if (bracketBalance !== 0 || arrayBalance !== 0) {
      return {
        success: false,
        error: 'Incomplete JSON response - brackets or arrays not balanced',
        cleaned
      };
    }
    
    const parsed = JSON.parse(cleaned);
    return {
      success: true,
      data: parsed
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Failed to parse AI response',
      raw: aiResponse
    };
  }
}

module.exports = {
  getFieldMappingPrompt,
  injectClientData,
  validateMappedFields,
  parseAIResponse
};

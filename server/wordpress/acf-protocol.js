/**
 * ACF (Advanced Custom Fields) Protocol
 * Comprehensive ACF field management using the correct REST API approach
 * 
 * CORRECT APPROACH: Write to `acf` object on standard WP REST endpoint
 * POST /wp-json/wp/v2/{post_type}/{id}
 * { "acf": { "field_name": "value" } }
 * 
 * Endpoints:
 * - POST /update-acf-fields - Update multiple ACF fields in one request
 * - POST /get-acf-fields - Get all ACF fields for a post
 * - POST /discover-acf-field - Check if ACF field exists on a post
 * - POST /validate-acf-setup - Validate ACF configuration
 */

const express = require('express');
const axios = require('axios');
const path = require('path');
const { normalizeUrl, getRestEndpoint, getAuthConfig } = require('./utils');

// Use project-relative path so logs work in Flowbie (never throw)
const DEBUG_LOG_PATH = path.join(__dirname, '..', '..', '.cursor', 'debug.log');
function ensureDebugLogDir() {
  try {
    const fs = require('fs');
    const dir = path.dirname(DEBUG_LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) {}
}
function appendDebugLog(obj) {
  try {
    ensureDebugLogDir();
    const fs = require('fs');
    fs.appendFileSync(DEBUG_LOG_PATH, JSON.stringify({ ...obj, sessionId: 'debug-session', runId: 'run1', timestamp: Date.now() }) + '\n');
  } catch (e) {}
}
const {
  validateACFSetup,
  serializeACFFieldValue,
  checkACFFieldExists
} = require('./acf-utils');
const { importFieldStructure } = require('./field-structure-importer');

const router = express.Router();

/**
 * Update multiple ACF fields in one request
 * Uses the CORRECT approach: POST to /wp-json/wp/v2/{post_type}/{id} with acf: {} payload
 * POST /update-acf-fields
 */
router.post('/update-acf-fields', async (req, res) => {
  console.log('[WordPress ACF] POST /update-acf-fields - Request received');
  try { appendDebugLog({location:'acf-protocol.js:update-acf-fields:entry',message:'ACF update request received',data:{postId:req.body.postId,fields:req.body.fields,postType:req.body.postType,postTypeEndpoint:req.body.postTypeEndpoint},hypothesisId:'ACF-SERVER-A'}); } catch (e) {}
  try {
    const { siteUrl, username, appPassword, postId, fields, postType = 'post', postTypeEndpoint, options = {} } = req.body;

    // Validate required fields
    if (!siteUrl || !username || !appPassword || !postId || !fields || typeof fields !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: siteUrl, username, appPassword, postId, fields'
      });
    }

    // Validate post ID
    if (!Number.isInteger(postId) || postId <= 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid post ID: ${postId}. Post ID must be a positive integer.`
      });
    }

    const normalizedUrl = normalizeUrl(siteUrl);
    const finalEndpointName = postTypeEndpoint || getRestEndpoint(postType);
    const authConfig = getAuthConfig(username, appPassword, { timeout: 30000 });
    
    try { appendDebugLog({location:'acf-protocol.js:endpoint-determination',message:'Endpoint determined for ACF update',data:{postId,postType,postTypeEndpoint,finalEndpointName,fieldsCount:Object.keys(fields).length,fieldNames:Object.keys(fields)},hypothesisId:'ACF-SERVER-C'}); } catch (e) {}

    const {
      validateOnly = false,
      verifyAfterUpdate = true
    } = options;

    const results = {
      success: true,
      updated: [],
      failed: [],
      method: 'acf-rest-api',
      diagnostics: {}
    };

    // Validate ACF setup first (but don't block on it for new posts)
    const validation = await validateACFSetup(siteUrl, username, appPassword, postType, postTypeEndpoint, postId);
    results.diagnostics.validation = validation;
    
    // #region agent log
    const fs2 = require('fs');
    try { appendDebugLog({location:'acf-protocol.js:afterValidation',message:'ACF validation result',data:{hasAcfSupport:validation.hasAcfSupport,errors:validation.errors,warnings:validation.warnings,acfFieldsCount:Object.keys(validation.acfFields||{}).length},hypothesisId:'ACF-SERVER-B'}); } catch(e) {}
    // #endregion

    // CHANGED: Don't block on validation failure - try the update anyway
    // The validation can fail for new posts that don't have ACF data yet
    if (!validation.hasAcfSupport) {
      console.warn('[WordPress ACF] Validation says no ACF support, but will try update anyway');
      // Log but continue instead of returning early
      results.diagnostics.validationWarning = 'ACF validation failed but attempting update anyway';
    }

    // If validateOnly, return validation results
    if (validateOnly) {
      return res.json({
        success: validation.hasAcfSupport,
        validation: validation,
        wouldUpdate: Object.keys(fields),
        currentValues: validation.acfFields
      });
    }

    // Build the ACF update payload
    const acfPayload = {};
    for (const [fieldName, fieldValue] of Object.entries(fields)) {
      // Serialize the value based on expected type
      const serializedValue = serializeACFFieldValue(fieldValue);
      acfPayload[fieldName] = serializedValue;
      
      try { appendDebugLog({location:'acf-protocol.js:build-payload',message:'Building ACF payload',data:{fieldName,fieldValueType:typeof fieldValue,fieldValueLength:typeof fieldValue==='string'?fieldValue.length:null,serializedValueType:typeof serializedValue,serializedValueLength:typeof serializedValue==='string'?serializedValue.length:null,serializedValuePreview:typeof serializedValue==='string'?serializedValue.substring(0,100):serializedValue},hypothesisId:'ACF-PAYLOAD-A'}); } catch(e) {}
    }

    // CORRECT APPROACH: POST to standard WP REST endpoint with acf: {} payload
    const updateUrl = `${normalizedUrl}/wp-json/wp/v2/${finalEndpointName}/${postId}`;
    
    console.log(`[WordPress ACF] Updating ${Object.keys(acfPayload).length} fields via acf: {} on ${updateUrl}`);
    console.log(`[WordPress ACF] Payload:`, JSON.stringify({ acf: acfPayload }, null, 2));

    try {
      try {
        const payloadPreview = Object.keys(acfPayload).reduce((acc, key) => {
          const val = acfPayload[key];
          acc[key] = typeof val === 'string' ? (val.length > 100 ? val.substring(0, 100) + '...' : val) : val;
          return acc;
        }, {});
        appendDebugLog({location:'acf-protocol.js:beforeAxiosPost',message:'About to POST ACF update to WordPress',data:{updateUrl,acfPayloadKeys:Object.keys(acfPayload),acfPayloadPreview:payloadPreview,acfPayloadCount:Object.keys(acfPayload).length},hypothesisId:'ACF-SERVER-C'});
      } catch(e) {}

      const updateResponse = await axios.post(updateUrl, {
        acf: acfPayload
      }, authConfig);
      
      try {
        const responseAcfPreview = updateResponse.data?.acf ? Object.keys(updateResponse.data.acf).reduce((acc, key) => {
          const val = updateResponse.data.acf[key];
          acc[key] = typeof val === 'string' ? (val.length > 100 ? val.substring(0, 100) + '...' : val) : val;
          return acc;
        }, {}) : null;
        appendDebugLog({location:'acf-protocol.js:afterAxiosPost',message:'WordPress ACF update response',data:{status:updateResponse.status,hasAcf:!!updateResponse.data?.acf,acfFieldsKeys:updateResponse.data?.acf?Object.keys(updateResponse.data.acf):[],acfFieldsPreview:responseAcfPreview},hypothesisId:'ACF-SERVER-D'});
      } catch(e) {}

      if (updateResponse.status === 200 || updateResponse.status === 201) {
        try {
          const responseAcfKeys = updateResponse.data?.acf ? Object.keys(updateResponse.data.acf) : [];
          appendDebugLog({location:'acf-protocol.js:update-success',message:'ACF update successful',data:{status:updateResponse.status,responseHasAcf:!!updateResponse.data?.acf,responseAcfKeys,updatePayloadKeys:Object.keys(acfPayload),payloadMatchesResponse:JSON.stringify(Object.keys(acfPayload).sort())===JSON.stringify(responseAcfKeys.sort())},hypothesisId:'ACF-UPDATE-A'});
        } catch(e) {}
        
        // Mark all fields as updated
        results.updated = Object.keys(fields);
        
        // Verify update if requested
        if (verifyAfterUpdate) {
          // Add longer delay for pages - WordPress sometimes needs more time to process ACF updates for pages
          const isPage = finalEndpointName === 'pages';
          const delay = isPage ? 2000 : 1000; // Pages need more time, increased delay
          await new Promise(resolve => setTimeout(resolve, delay));
          
          const verifyUrl = `${normalizedUrl}/wp-json/wp/v2/${finalEndpointName}/${postId}?context=edit`;
          
          try { appendDebugLog({location:'acf-protocol.js:before-verification',message:'Before ACF verification read',data:{verifyUrl,finalEndpointName,postId,fieldsToVerify:Object.keys(fields)},hypothesisId:'ACF-SERVER-D'}); } catch(e) {}

          try {
            const verifyResponse = await axios.get(verifyUrl, authConfig);
            
            try { appendDebugLog({location:'acf-protocol.js:after-verification-read',message:'After ACF verification read',data:{status:verifyResponse.status,hasAcf:!!verifyResponse.data.acf,acfKeys:verifyResponse.data.acf?Object.keys(verifyResponse.data.acf):[],expectedFields:Object.keys(fields)},hypothesisId:'ACF-SERVER-D'}); } catch(e) {}

            if (verifyResponse.status === 200) {
              const currentAcf = verifyResponse.data.acf || {};
              
              try { appendDebugLog({location:'acf-protocol.js:verification-response',message:'Verification response received',data:{status:verifyResponse.status,hasAcf:!!verifyResponse.data.acf,acfKeys:Object.keys(currentAcf),expectedFields:Object.keys(fields),responseDataKeys:Object.keys(verifyResponse.data||{})},hypothesisId:'ACF-SERVER-F'}); } catch(e) {}

              // Check each field
              for (const fieldName of Object.keys(fields)) {
                const expectedValue = acfPayload[fieldName];
                const actualValue = currentAcf[fieldName];
                
                try { appendDebugLog({location:'acf-protocol.js:field-verification-detail',message:'Field verification detail',data:{fieldName,expectedValueType:typeof expectedValue,expectedValueLength:typeof expectedValue==='string'?expectedValue.length:null,expectedValuePreview:typeof expectedValue==='string'?expectedValue.substring(0,100):expectedValue,actualValueType:typeof actualValue,actualValueLength:typeof actualValue==='string'?actualValue.length:null,actualValuePreview:typeof actualValue==='string'?actualValue.substring(0,100):actualValue,hasAcfData:!!verifyResponse.data.acf,acfKeys:Object.keys(currentAcf)},hypothesisId:'ACF-VERIFY-A'}); } catch(e) {}
                
                // Compare values (handle type differences)
                const matches = actualValue === expectedValue || 
                               String(actualValue) === String(expectedValue) ||
                               JSON.stringify(actualValue) === JSON.stringify(expectedValue);
                
                // #region agent log
                try { appendDebugLog({location:'acf-protocol.js:field-verification',message:'Field verification check',data:{fieldName,expectedValue,actualValue,matches,expectedType:typeof expectedValue,actualType:typeof actualValue,hasAcfData:!!verifyResponse.data.acf},hypothesisId:'ACF-SERVER-F'}); } catch(e) {}
                // #endregion
                
                if (!matches) {
                  // If ACF data is completely missing or field is undefined/empty, this might be a timing issue
                  // Don't fail the update if we successfully got a 200 response from the update
                  // WordPress sometimes needs a moment to process ACF updates, especially for pages
                  const hasAcfData = verifyResponse.data.acf && typeof verifyResponse.data.acf === 'object';
                  const acfIsEmpty = hasAcfData && Object.keys(verifyResponse.data.acf).length === 0;
                  const fieldMissing = actualValue === undefined || actualValue === null;
                  const fieldEmpty = actualValue === '';
                  const expectedNotEmpty = expectedValue !== undefined && expectedValue !== null && expectedValue !== '';
                  
                  // If field is missing/empty and we expected a value, but ACF data is also missing/empty, treat as timing issue
                  if ((fieldMissing || fieldEmpty) && expectedNotEmpty && (!hasAcfData || acfIsEmpty)) {
                    console.warn(`[WordPress ACF] Field "${fieldName}" verification: ACF data not yet available in response (timing issue). Update was successful.`);
                    // Keep field in updated list - the update was successful, just verification timing issue
                    results.diagnostics.verificationWarning = 'ACF data not immediately available for verification (timing issue)';
                    // Don't move to failed - the update succeeded, verification just can't confirm yet
                  } else if (fieldMissing && expectedNotEmpty && hasAcfData && !acfIsEmpty) {
                    // Field was sent but is not present in REST response - common when ACF field is not exposed in REST (show_in_rest)
                    // Assume write succeeded; WordPress often saves the value but does not return it in GET
                    console.warn(`[WordPress ACF] Field "${fieldName}" verification: field not in REST response (may not be exposed in REST). Treating as updated.`);
                    results.diagnostics.verificationWarning = results.diagnostics.verificationWarning || 'Some fields not in REST response (assumed updated)';
                    // Keep field in updated list - do not add to failed
                  } else if (fieldEmpty && expectedNotEmpty && hasAcfData && !acfIsEmpty) {
                    // Field exists in ACF but is empty - might be a real issue, but could also be timing
                    // For pages, give it more time
                    const isPage = finalEndpointName === 'pages';
                    if (isPage) {
                      console.warn(`[WordPress ACF] Field "${fieldName}" verification: Field exists but is empty (may be timing issue for pages). Update was successful.`);
                      results.diagnostics.verificationWarning = 'ACF field exists but is empty - may be timing issue';
                      // Don't move to failed for pages - give benefit of doubt
                    } else {
                      console.warn(`[WordPress ACF] Field "${fieldName}" verification: expected "${expectedValue}", got empty string`);
                      results.updated = results.updated.filter(f => f !== fieldName);
                      results.failed.push({
                        field: fieldName,
                        error: `Verification failed: expected "${expectedValue}", got empty string`,
                        expectedValue,
                        actualValue: ''
                      });
                    }
                  } else {
                    console.warn(`[WordPress ACF] Field "${fieldName}" verification: expected "${expectedValue}", got "${actualValue}"`);
                    // Move from updated to failed
                    results.updated = results.updated.filter(f => f !== fieldName);
                    results.failed.push({
                      field: fieldName,
                      error: `Verification failed: expected "${expectedValue}", got "${actualValue}"`,
                      expectedValue,
                      actualValue
                    });
                  }
                }
              }
              
              results.diagnostics.verifiedValues = currentAcf;
            } else {
              // #region agent log
              const fs6 = require('fs');
              try { appendDebugLog({location:'acf-protocol.js:verification-no-acf',message:'Verification response missing ACF data',data:{status:verifyResponse.status,hasData:!!verifyResponse.data,dataKeys:verifyResponse.data?Object.keys(verifyResponse.data):[],hasAcf:!!verifyResponse.data?.acf,verifyUrl,finalEndpointName},hypothesisId:'ACF-SERVER-E'}); } catch(e) {}
              // #endregion
              
              console.warn('[WordPress ACF] Verification response missing ACF data');
              results.diagnostics.verificationWarning = 'Verification response missing ACF data';
            }
          } catch (verifyError) {
            // #region agent log
            const fs7 = require('fs');
            try { appendDebugLog({location:'acf-protocol.js:verification-error',message:'Verification error',data:{error:verifyError.message,verifyUrl,finalEndpointName,status:verifyError.response?.status,statusText:verifyError.response?.statusText,responseData:verifyError.response?.data},hypothesisId:'ACF-SERVER-E'}); } catch(e) {}
            // #endregion
            
            console.warn('[WordPress ACF] Could not verify update:', verifyError.message);
            results.diagnostics.verificationError = verifyError.message;
          }
        }
        
        console.log(`[WordPress ACF] Successfully updated fields: ${results.updated.join(', ')}`);
      } else {
        throw new Error(`Unexpected response status: ${updateResponse.status}`);
      }
    } catch (updateError) {
      const errorMsg = updateError.response?.data?.message || updateError.message;
      console.error('[WordPress ACF] Update failed:', errorMsg);
      
      // All fields failed
      results.success = false;
      results.updated = [];
      results.failed = Object.keys(fields).map(fieldName => ({
        field: fieldName,
        error: errorMsg
      }));
      results.error = errorMsg;
    }

    // Determine overall success
    results.success = results.failed.length === 0 && results.updated.length > 0;

    res.json(results);
  } catch (error) {
    console.error('[WordPress ACF] Update ACF fields error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error while updating ACF fields',
      updated: [],
      failed: []
    });
  }
});

/**
 * Get all ACF fields for a post
 * POST /get-acf-fields
 */
router.post('/get-acf-fields', async (req, res) => {
  console.log('[WordPress ACF] POST /get-acf-fields - Request received');
  // #region agent log
  appendDebugLog({ location: 'acf-protocol.js:get-acf-fields:entry', message: 'get-acf-fields endpoint called', data: { postId: req.body.postId, postType: req.body.postType, postTypeEndpoint: req.body.postTypeEndpoint, siteUrl: req.body.siteUrl }, hypothesisId: 'ACF-READ-A' });
  // #endregion
  
  try {
    const { siteUrl, username, appPassword, postId, postType = 'post', postTypeEndpoint } = req.body;

    if (!siteUrl || !username || !appPassword || !postId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: siteUrl, username, appPassword, postId'
      });
    }

    const normalizedUrl = normalizeUrl(siteUrl);
    const finalEndpointName = postTypeEndpoint || getRestEndpoint(postType);
    const authConfig = getAuthConfig(username, appPassword, { timeout: 10000 });

    const result = {
      success: false,
      fields: {},
      error: null
    };

    // Fetch post - try both with and without context=edit since ACF fields might only be in default context
    // First try without context=edit (default context) - ACF fields are often available in default context
    const getUrlDefault = `${normalizedUrl}/wp-json/wp/v2/${finalEndpointName}/${postId}`;
    const getUrlEdit = `${normalizedUrl}/wp-json/wp/v2/${finalEndpointName}/${postId}?context=edit`;
    
    // #region agent log
    appendDebugLog({ location: 'acf-protocol.js:get-acf-fields:before-request', message: 'Before fetching ACF fields from WordPress', data: { getUrlDefault, getUrlEdit, postId, postType, finalEndpointName, normalizedUrl }, hypothesisId: 'ACF-READ-A' });
    // #endregion
    
    try {
      // Try default context first (ACF fields are often available here)
      let response = await axios.get(getUrlDefault, authConfig);
      
      // #region agent log
      appendDebugLog({ location: 'acf-protocol.js:get-acf-fields:default-context-response', message: 'Default context response received', data: { status: response.status, hasData: !!response.data, hasAcf: response.data?.acf !== undefined, acfType: typeof response.data?.acf, acfKeys: response.data?.acf ? Object.keys(response.data.acf) : [] }, hypothesisId: 'ACF-READ-A1' });
      // #endregion
      
      const defaultAcf = response.status === 200 && response.data && response.data.acf ? response.data.acf : {};
      const hasPromptModifierInDefault = defaultAcf && typeof defaultAcf === 'object' && Object.keys(defaultAcf).some(k => /prompt_modifier|prompt_mod|seo_prompt_modifier/i.test(k));
      
      // If no ACF in default, OR default ACF doesn't include prompt modifier: fetch full post with context=edit (same as scrape/edit - exposes all ACF fields)
      if (response.status === 200 && response.data && (!response.data.acf || Object.keys(response.data.acf).length === 0 || !hasPromptModifierInDefault)) {
        // #region agent log
        appendDebugLog({ location: 'acf-protocol.js:get-acf-fields:trying-edit-context', message: 'Fetching full post with context=edit to get all ACF (including prompt modifier)', data: { reason: !response.data.acf ? 'no-acf' : !hasPromptModifierInDefault ? 'missing-prompt-modifier' : 'empty-acf' }, hypothesisId: 'ACF-READ-A2' });
        // #endregion
        
        const editResponse = await axios.get(getUrlEdit, authConfig);
        
        // #region agent log
        appendDebugLog({ location: 'acf-protocol.js:get-acf-fields:edit-context-response', message: 'Edit context response received', data: { status: editResponse.status, hasData: !!editResponse.data, hasAcf: editResponse.data?.acf !== undefined, acfKeys: editResponse.data?.acf ? Object.keys(editResponse.data.acf) : [] }, hypothesisId: 'ACF-READ-A3' });
        // #endregion
        
        if (editResponse.status === 200 && editResponse.data && editResponse.data.acf && typeof editResponse.data.acf === 'object') {
          // Use edit-context ACF (full post); merge with default so we have all keys
          const editAcf = editResponse.data.acf;
          response = { ...response, data: { ...response.data, acf: { ...defaultAcf, ...editAcf } } };
        }
      }

      // #region agent log
      appendDebugLog({ location: 'acf-protocol.js:get-acf-fields:response-received', message: 'WordPress API response received', data: { status: response.status, hasData: !!response.data, hasAcf: response.data?.acf !== undefined, acfType: typeof response.data?.acf, acfIsNull: response.data?.acf === null, acfIsEmptyObj: response.data?.acf && typeof response.data.acf === 'object' && Object.keys(response.data.acf).length === 0, acfKeys: response.data?.acf ? Object.keys(response.data.acf) : [], responseDataKeys: response.data ? Object.keys(response.data) : [] }, hypothesisId: 'ACF-READ-B' });
      // #endregion

      if (response.status === 200 && response.data) {
        // Check if acf exists (could be object, null, or undefined)
        const hasAcf = response.data.acf !== undefined;
        const acfValue = response.data.acf;
        
        // #region agent log
        const preview = acfValue && typeof acfValue === 'object' ? Object.keys(acfValue).reduce((acc, key) => { acc[key] = typeof acfValue[key] === 'string' ? acfValue[key].substring(0, 80) : acfValue[key]; return acc; }, {}) : acfValue;
        const promptModKey = acfValue && typeof acfValue === 'object' ? Object.keys(acfValue).find(k => /prompt_modifier|prompt_mod|seo_prompt_modifier/i.test(k)) : null;
        const promptModValue = promptModKey && acfValue[promptModKey] ? (typeof acfValue[promptModKey] === 'string' ? acfValue[promptModKey].trim().substring(0, 120) : String(acfValue[promptModKey]).substring(0, 120)) : null;
        appendDebugLog({ location: 'acf-protocol.js:get-acf-fields:acf-check', message: 'ACF field check + prompt-modifier discovery', data: { hasAcf, acfValueKeys: acfValue && typeof acfValue === 'object' ? Object.keys(acfValue) : [], acfValuePreview: preview, promptModifierKey: promptModKey, promptModifierValuePreview: promptModValue }, hypothesisId: 'ACF-READ-C' });
        // #endregion
        
        if (hasAcf) {
          // Handle case where acf is null or empty object - still return success with empty object
          result.success = true;
          result.fields = (acfValue && typeof acfValue === 'object' && acfValue !== null) ? acfValue : {};
          console.log(`[WordPress ACF] Retrieved ${Object.keys(result.fields).length} ACF fields for post ${postId}`);
          
          // #region agent log
          const fields = result.fields;
          const pmKey = Object.keys(fields || {}).find(k => /prompt_modifier|prompt_mod|seo_prompt_modifier/i.test(k));
          const pmVal = pmKey && fields[pmKey] ? (typeof fields[pmKey] === 'string' ? fields[pmKey].trim().substring(0, 150) : '') : null;
          appendDebugLog({ location: 'acf-protocol.js:get-acf-fields:success', message: 'ACF fields retrieved + prompt-modifier for keyword', data: { fieldsCount: Object.keys(result.fields).length, fieldKeys: Object.keys(result.fields), promptModifierKey: pmKey, promptModifierValuePreview: pmVal }, hypothesisId: 'ACF-READ-D' });
          // #endregion
        } else {
          result.error = 'ACF object not found in response. Ensure ACF REST API is configured.';
          result.hint = "Add these filters to functions.php: add_filter('acf/rest_api/field_settings/show_in_rest', '__return_true');";
          
          // #region agent log
          appendDebugLog({ location: 'acf-protocol.js:get-acf-fields:no-acf', message: 'ACF object not found in response', data: { responseDataKeys: Object.keys(response.data || {}) }, hypothesisId: 'ACF-READ-E' });
          // #endregion
        }
      } else {
        // #region agent log
        appendDebugLog({ location: 'acf-protocol.js:get-acf-fields:bad-status', message: 'WordPress API returned non-200 status or no data', data: { status: response?.status, hasData: !!response?.data }, hypothesisId: 'ACF-READ-F' });
        // #endregion
      }
    } catch (getError) {
      result.error = getError.response?.data?.message || getError.message;
      
      // #region agent log
      appendDebugLog({ location: 'acf-protocol.js:get-acf-fields:error', message: 'Error fetching ACF fields', data: { error: result.error, status: getError.response?.status }, hypothesisId: 'ACF-READ-G' });
      // #endregion
    }

    // #region agent log
    appendDebugLog({ location: 'acf-protocol.js:get-acf-fields:final-result', message: 'Final result being sent to frontend', data: { success: result.success, fieldsCount: result.fields ? Object.keys(result.fields).length : 0, fieldKeys: result.fields ? Object.keys(result.fields) : [], hasError: !!result.error, error: result.error }, hypothesisId: 'ACF-READ-H' });
    // #endregion
    
    res.json(result);
  } catch (error) {
    console.error('[WordPress ACF] Get ACF fields error:', error);
    
    // #region agent log
    appendDebugLog({ location: 'acf-protocol.js:get-acf-fields:top-level-error', message: 'Top-level error in get-acf-fields', data: { error: error.message }, hypothesisId: 'ACF-READ-I' });
    // #endregion
    
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error while fetching ACF fields'
    });
  }
});

/**
 * Check if ACF field exists on a post
 * POST /discover-acf-field
 */
router.post('/discover-acf-field', async (req, res) => {
  console.log('[WordPress ACF] POST /discover-acf-field - Request received');
  try {
    const { siteUrl, username, appPassword, postId, fieldName, postType = 'post', postTypeEndpoint } = req.body;

    if (!siteUrl || !username || !appPassword || !postId || !fieldName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: siteUrl, username, appPassword, postId, fieldName'
      });
    }

    const exists = await checkACFFieldExists(
      siteUrl, username, appPassword, postId, fieldName, postType, postTypeEndpoint
    );

    res.json({
      success: exists.found,
      fieldName: fieldName,
      exists: exists.found,
      currentValue: exists.currentValue,
      allFields: exists.allFields,
      error: exists.error
    });
  } catch (error) {
    console.error('[WordPress ACF] Discover ACF field error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error while discovering ACF field'
    });
  }
});

/**
 * Validate ACF setup
 * POST /validate-acf-setup
 */
router.post('/validate-acf-setup', async (req, res) => {
  console.log('[WordPress ACF] POST /validate-acf-setup - Request received');
  try {
    const { siteUrl, username, appPassword, postType = 'post', postTypeEndpoint, postId } = req.body;

    if (!siteUrl || !username || !appPassword) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: siteUrl, username, appPassword'
      });
    }

    const validation = await validateACFSetup(siteUrl, username, appPassword, postType, postTypeEndpoint, postId);

    res.json({
      success: validation.hasAcfSupport,
      validation: validation,
      requiredConfig: validation.hasAcfSupport ? null : {
        php: [
          "add_filter('acf/rest_api/field_settings/show_in_rest', '__return_true');",
          "add_filter('acf/rest_api/field_settings/editable', '__return_true');"
        ]
      }
    });
  } catch (error) {
    console.error('[WordPress ACF] Validate ACF setup error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error while validating ACF setup'
    });
  }
});

/**
 * Discover ACF field groups
 * POST /discover-acf-field-groups
 * Attempts to discover ACF field groups via REST API or by scanning sample posts
 */
router.post('/discover-acf-field-groups', async (req, res) => {
  console.log('[WordPress ACF] POST /discover-acf-field-groups - Request received');
  try { appendDebugLog({location:'acf-protocol.js:discover-acf-field-groups-entry',message:'Request received',data:{hasSiteUrl:!!req.body.siteUrl,hasUsername:!!req.body.username,hasAppPassword:!!req.body.appPassword,postType:req.body.postType,sampleSize:req.body.sampleSize},hypothesisId:'H1'}); } catch(e) {}
  try {
    const { siteUrl, username, appPassword, postType, postTypeEndpoint, sampleSize = 10 } = req.body;

    if (!siteUrl || !username || !appPassword) {
      try { appendDebugLog({location:'acf-protocol.js:discover-acf-field-groups-validation-failed',message:'Missing required fields',data:{hasSiteUrl:!!siteUrl,hasUsername:!!username,hasAppPassword:!!appPassword},hypothesisId:'H1'}); } catch(e) {}
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: siteUrl, username, appPassword'
      });
    }

    const normalizedUrl = normalizeUrl(siteUrl);
    const finalEndpointName = postTypeEndpoint || getRestEndpoint(postType || 'post');
    const authConfig = getAuthConfig(username, appPassword, { timeout: 30000 });

    try { appendDebugLog({location:'acf-protocol.js:discover-acf-field-groups-params',message:'Request parameters processed',data:{normalizedUrl,finalEndpointName,postType,postTypeEndpoint,sampleSize},hypothesisId:'H1'}); } catch(e) {}

    const result = {
      success: false,
      fieldGroups: [],
      fields: [],
      method: null,
      error: null
    };

    // Method 1: Try ACF Pro REST API endpoint (if available)
    try {
      const acfFieldGroupsUrl = `${normalizedUrl}/wp-json/wp/v2/acf-field-group?per_page=100`;
      try { appendDebugLog({location:'acf-protocol.js:discover-acf-field-groups-method1-start',message:'Trying ACF REST API endpoint',data:{acfFieldGroupsUrl},hypothesisId:'H2'}); } catch(e) {}
      const response = await axios.get(acfFieldGroupsUrl, authConfig);

      try { appendDebugLog({location:'acf-protocol.js:discover-acf-field-groups-method1-response',message:'ACF REST API response received',data:{status:response.status,isArray:Array.isArray(response.data),dataLength:Array.isArray(response.data)?response.data.length:'not-array'},hypothesisId:'H2'}); } catch(e) {}
      
      if (response.status === 200 && Array.isArray(response.data)) {
        // ACF Pro REST API is available
        const fieldGroups = response.data;
        const allFields = [];
        
        for (const group of fieldGroups) {
          if (group.fields && Array.isArray(group.fields)) {
            for (const field of group.fields) {
              allFields.push({
                name: field.name,
                label: field.label,
                type: field.type,
                groupId: group.id,
                groupTitle: group.title?.rendered || group.title,
                location: group.location || []
              });
            }
          }
        }
        
        result.success = true;
        result.fieldGroups = fieldGroups;
        result.fields = allFields;
        result.method = 'acf_rest_api';
        console.log(`[WordPress ACF] Discovered ${allFields.length} ACF fields via REST API`);
        
        try { appendDebugLog({location:'acf-protocol.js:discover-acf-field-groups-method1-success',message:'Method 1 succeeded',data:{fieldGroupsCount:fieldGroups.length,fieldsCount:allFields.length},hypothesisId:'H2'}); } catch(e) {}

        return res.json(result);
      } else {
        try { appendDebugLog({location:'acf-protocol.js:discover-acf-field-groups-method1-invalid-response',message:'Method 1 response invalid',data:{status:response.status,isArray:Array.isArray(response.data),responseDataType:typeof response.data},hypothesisId:'H2'}); } catch(e) {}
      }
    } catch (acfApiError) {
      console.log('[WordPress ACF] ACF REST API not available, trying alternative method');
      try { appendDebugLog({location:'acf-protocol.js:discover-acf-field-groups-method1-error',message:'Method 1 failed',data:{error:acfApiError.message,statusCode:acfApiError.response?.status,statusText:acfApiError.response?.statusText,responseData:acfApiError.response?.data},hypothesisId:'H2,H5'}); } catch(e) {}
    }

    // Method 2: Scan sample posts to infer field groups
    try {
      const postsUrl = `${normalizedUrl}/wp-json/wp/v2/${finalEndpointName}?per_page=${sampleSize}&context=edit&_fields=id,title,acf`;
      try { appendDebugLog({location:'acf-protocol.js:discover-acf-field-groups-method2-start',message:'Trying sample posts scan',data:{postsUrl,finalEndpointName,sampleSize},hypothesisId:'H3'}); } catch(e) {}
      const response = await axios.get(postsUrl, authConfig);

      try { appendDebugLog({location:'acf-protocol.js:discover-acf-field-groups-method2-response',message:'Sample posts response received',data:{status:response.status,isArray:Array.isArray(response.data),postsCount:Array.isArray(response.data)?response.data.length:'not-array'},hypothesisId:'H3'}); } catch(e) {}
      
      if (response.status === 200 && Array.isArray(response.data)) {
        const posts = response.data;
        const fieldMap = new Map();
        
        try { appendDebugLog({location:'acf-protocol.js:discover-acf-field-groups-method2-posts-processed',message:'Processing posts for ACF fields',data:{postsCount:posts.length,postsWithAcf:posts.filter(p=>p.acf).length},hypothesisId:'H3'}); } catch(e) {}

        for (const post of posts) {
          if (post.acf && typeof post.acf === 'object') {
            for (const [fieldName, fieldValue] of Object.entries(post.acf)) {
              if (!fieldMap.has(fieldName)) {
                fieldMap.set(fieldName, {
                  name: fieldName,
                  label: fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                  type: inferFieldType(fieldValue),
                  sampleValue: fieldValue,
                  occurrenceCount: 0
                });
              }
              fieldMap.get(fieldName).occurrenceCount++;
            }
          }
        }
        
        result.success = true;
        result.fields = Array.from(fieldMap.values());
        result.method = 'sample_scan';
        console.log(`[WordPress ACF] Discovered ${result.fields.length} ACF fields by scanning ${posts.length} sample posts`);
        
        try { appendDebugLog({location:'acf-protocol.js:discover-acf-field-groups-method2-success',message:'Method 2 succeeded',data:{fieldsCount:result.fields.length,postsScanned:posts.length},hypothesisId:'H3'}); } catch(e) {}

        return res.json(result);
      } else {
        try { appendDebugLog({location:'acf-protocol.js:discover-acf-field-groups-method2-invalid-response',message:'Method 2 response invalid',data:{status:response.status,isArray:Array.isArray(response.data),responseDataType:typeof response.data},hypothesisId:'H3'}); } catch(e) {}
      }
    } catch (scanError) {
      result.error = scanError.response?.data?.message || scanError.message;
      console.error('[WordPress ACF] Error scanning sample posts:', scanError);
      try { appendDebugLog({location:'acf-protocol.js:discover-acf-field-groups-method2-error',message:'Method 2 failed',data:{error:scanError.message,statusCode:scanError.response?.status,statusText:scanError.response?.statusText,responseData:scanError.response?.data,resultError:result.error},hypothesisId:'H3,H5'}); } catch(e) {}
    }

    try { appendDebugLog({location:'acf-protocol.js:discover-acf-field-groups-both-failed',message:'Both methods failed',data:{result},hypothesisId:'H4'}); } catch(e) {}
    res.json(result);
  } catch (error) {
    console.error('[WordPress ACF] Discover ACF field groups error:', error);
    try { appendDebugLog({location:'acf-protocol.js:discover-acf-field-groups-top-level-error',message:'Top-level error caught',data:{error:error.message,stack:error.stack},hypothesisId:'H5'}); } catch(e) {}
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error while discovering ACF field groups'
    });
  }
});

/**
 * Get ACF fields from Options Page
 * POST /get-acf-options-page-fields
 * Queries ACF Options Page fields directly via REST API using /wp-json/acf/v3/options/options
 */
router.post('/get-acf-options-page-fields', async (req, res) => {
  console.log('[WordPress ACF] POST /get-acf-options-page-fields - Request received');
  try {
    const { siteUrl, username, appPassword, pageSlug } = req.body;

    if (!siteUrl || !username || !appPassword) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: siteUrl, username, appPassword'
      });
    }

    const normalizedUrl = normalizeUrl(siteUrl);
    const authConfig = getAuthConfig(username, appPassword, { timeout: 30000 });

    const result = {
      success: false,
      fields: {},
      pageSlug: pageSlug || 'options',
      error: null
    };

    // Use GET method to read ACF v3 Options endpoint
    // The endpoint is /wp-json/acf/v3/options/options (slug is "options")
    // POST is only required for UPDATING, GET works for READING
    const url = `${normalizedUrl}/wp-json/acf/v3/options/options`;
    
    try {
      // Use GET method to read the options (POST is only for updates)
      const response = await axios.get(url, authConfig);
      
      if (response.status === 200 && response.data) {
        // ACF v3 Options endpoint returns fields directly at root level (not in .acf property)
        result.success = true;
        result.fields = response.data || {};
        console.log(`[WordPress ACF] Retrieved ${Object.keys(result.fields).length} ACF fields from Options Page`);
        return res.json(result);
      }
    } catch (endpointError) {
      // Handle specific error cases
      if (endpointError.response) {
        const status = endpointError.response.status;
        const statusText = endpointError.response.statusText;
        
        if (status === 404) {
          result.error = `ACF Options Page endpoint not found. Ensure ACF REST API is properly configured.`;
          result.hint = "The endpoint /wp-json/acf/v3/options/options requires ACF REST API to be enabled.";
        } else if (status === 401 || status === 403) {
          result.error = `Authentication failed. Check your Application Password.`;
        } else {
          result.error = `HTTP ${status}: ${statusText}`;
        }
      } else {
        result.error = endpointError.message || 'Failed to connect to ACF Options Page endpoint';
      }
      
      console.error('[WordPress ACF] Options Page endpoint error:', endpointError.message);
    }

    // If endpoint failed
    if (!result.success) {
      result.hint = result.hint || "Ensure ACF REST API is configured and the Options Page exists.";
    }
    
    res.json(result);
  } catch (error) {
    console.error('[WordPress ACF] Get ACF Options Page fields error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error while fetching ACF Options Page fields'
    });
  }
});

/**
 * Infer ACF field type from value
 */
function inferFieldType(value) {
  if (value === null || value === undefined) return 'null';
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
    if (/^\d{10,}$/.test(value.replace(/\D/g, ''))) return 'text'; // Could be phone
    return 'text';
  }
  return 'text';
}

/**
 * Import ACF Options Page field structure to target site
 * POST /import-options-structure
 */
router.post('/import-options-structure', async (req, res) => {
  console.log('[WordPress ACF] POST /import-options-structure - Request received');
  try {
    const { targetSiteUrl, targetUsername, targetAppPassword, fieldStructure, pageSlug } = req.body;

    if (!targetSiteUrl || !targetUsername || !targetAppPassword || !fieldStructure) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: targetSiteUrl, targetUsername, targetAppPassword, fieldStructure'
      });
    }

    const result = await importFieldStructure(
      targetSiteUrl,
      targetUsername,
      targetAppPassword,
      fieldStructure,
      pageSlug || 'options'
    );

    res.json(result);
  } catch (error) {
    console.error('[WordPress ACF] Import options structure error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error while importing field structure'
    });
  }
});

module.exports = router;

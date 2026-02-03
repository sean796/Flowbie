/**
 * DataForSEO API routes and client
 */

const express = require('express');
const axios = require('axios');
const {
  DATAFORSEO_API_BASE,
  auth,
  LOCATION_MAP,
  ensureLanguageCode,
  sanitizeDataForSEOPayload,
  containsKeyDeep
} = require('./config');

const router = express.Router();

/**
 * Call DataForSEO API
 * @param {string} endpoint - API path (e.g. '/dataforseo_labs/google/keyword_overview/live')
 * @param {object|object[]} data - Request payload
 * @param {{ timeout?: number }} options - Optional; timeout in ms (default 60000). DataForSEO often needs >30s.
 */
async function callDataForSEO(endpoint, data, options = {}) {
  const timeoutMs = options.timeout != null ? options.timeout : 60000;
  try {
    // Validate endpoint path
    if (!endpoint || typeof endpoint !== 'string') {
      throw new Error('Invalid endpoint path');
    }
    
    console.log(`[DataForSEO] Calling API: ${endpoint}`);
    
    // CRITICAL: Sanitize payload to remove any language_name fields before sending
    // This is a final safety net to ensure DataForSEO API never receives this invalid field
    const originalData = data;
    data = sanitizeDataForSEOPayload(data);
    
    // Log if sanitization removed anything
    if (JSON.stringify(originalData) !== JSON.stringify(data)) {
      console.warn('[DataForSEO] WARNING: Payload sanitization removed language_name or other invalid fields!', {
        endpoint,
        originalKeys: Array.isArray(originalData) && originalData[0] ? Object.keys(originalData[0]) : 'not array',
        sanitizedKeys: Array.isArray(data) && data[0] ? Object.keys(data[0]) : 'not array'
      });
    }
    
    // CRITICAL: Final check for language_name in the sanitized data (should never happen after sanitization)
    if (Array.isArray(data) && data[0] && ('language_name' in data[0])) {
      console.error('[DataForSEO] CRITICAL ERROR: language_name still present after sanitization!', {
        endpoint,
        data: JSON.stringify(data, null, 2),
        firstItemKeys: Object.keys(data[0] || {})
      });
      throw new Error('language_name detected after sanitization - this should never happen!');
    }
    
    console.log(`[DataForSEO] Request body:`, JSON.stringify(data, null, 2));
    console.log(`[DataForSEO] Request body keys (first item):`, Array.isArray(data) && data[0] ? Object.keys(data[0]) : 'not array');
    
    // Log outgoing headers (Authorization as Base64 string for debugging - no password exposed)
    const outgoingHeaders = {
      'Authorization': `Basic ${auth}`, // Continuous Base64 string with no spaces
      'Content-Type': 'application/json',
    };
    console.log(`[DataForSEO] Outgoing headers:`, {
      'Authorization': `Basic ${auth.substring(0, 20)}...`, // Show first 20 chars for verification
      'Content-Type': outgoingHeaders['Content-Type']
    });
    
    // CRITICAL: Final deep check for language_name anywhere in payload
    if (containsKeyDeep(data, 'language_name')) {
      const errorMsg = 'CRITICAL: language_name detected in outgoing payload after sanitization!';
      console.error('[DataForSEO]', errorMsg, {
        endpoint,
        payload: JSON.stringify(data, null, 2),
        payloadKeys: Array.isArray(data) && data[0] ? Object.keys(data[0]) : 'not array'
      });
      throw new Error(errorMsg);
    }
    
    // Log exact outgoing payload right before POST (for forensic debugging)
    console.log('[DataForSEO] OUTGOING_PAYLOAD (final):', JSON.stringify(data, null, 2));
    console.log('[DataForSEO] Payload size:', JSON.stringify(data).length, 'bytes');
    console.log('[DataForSEO] Payload structure check:', {
      isArray: Array.isArray(data),
      firstItemType: Array.isArray(data) && data[0] ? typeof data[0] : 'N/A',
      firstItemKeys: Array.isArray(data) && data[0] ? Object.keys(data[0]) : 'N/A',
      hasLanguageName: containsKeyDeep(data, 'language_name'),
      hasLanguageCode: Array.isArray(data) && data[0] && 'language_code' in data[0]
    });
    
    // FINAL SAFETY: Deep clone via JSON stringify/parse to ensure complete removal of language_name
    // This creates a completely fresh object with no possibility of language_name
    let finalPayload = JSON.parse(JSON.stringify(data));
    
    // Apply sanitization one more time after stringify/parse
    finalPayload = sanitizeDataForSEOPayload(finalPayload);
    
    // Final verification - if language_name exists now, something is very wrong
    if (containsKeyDeep(finalPayload, 'language_name')) {
      console.error('[DataForSEO] FATAL: language_name still exists after JSON round-trip and sanitization!');
      console.error('[DataForSEO] Original data:', JSON.stringify(data, null, 2));
      console.error('[DataForSEO] Final payload:', JSON.stringify(finalPayload, null, 2));
      throw new Error('CRITICAL: language_name cannot be removed from payload - this should never happen');
    }
    
    console.log('[DataForSEO] Final payload keys (first item):', Array.isArray(finalPayload) && finalPayload[0] ? Object.keys(finalPayload[0]) : 'N/A');
    
    const response = await axios.post(
      `${DATAFORSEO_API_BASE}${endpoint}`,
      finalPayload,
      {
        headers: outgoingHeaders,
        timeout: timeoutMs,
      }
    );
    
    console.log(`[DataForSEO] Response Status: ${response.status}`);
    
    // Log full DataForSEO API response details for debugging
    if (response.data) {
      const apiStatus = response.data.status_code;
      const apiMessage = response.data.status_message;
      const tasksCount = response.data.tasks_count;
      const tasksError = response.data.tasks_error;
      
      console.log(`[DataForSEO] API Status: ${apiStatus} - ${apiMessage}`);
      console.log(`[DataForSEO] Tasks: ${tasksCount} total, ${tasksError} errors`);
      
      // Log task-level details (including errors)
      if (response.data.tasks && Array.isArray(response.data.tasks)) {
        response.data.tasks.forEach((task, index) => {
          console.log(`[DataForSEO] Task ${index}:`, {
            status_code: task.status_code,
            status_message: task.status_message,
            result_count: task.result_count || 0
          });
          
          if (task.status_code !== 20000) {
            console.error(`[DataForSEO] Task ${index} ERROR:`, {
              status_code: task.status_code,
              status_message: task.status_message,
              result_count: task.result_count
            });
          }
        });
      }
      
      // Log full response body for debugging (redact if needed)
      console.log(`[DataForSEO] Full response body:`, JSON.stringify(response.data, null, 2));
    }
    
    return response.data;
  } catch (error) {
    // Enhanced error logging - shows exactly what DataForSEO returned
    console.error('[DataForSEO] Error message:', error.message);
    
    if (error.response) {
      console.error('[DataForSEO] HTTP status:', error.response.status);
      console.error('[DataForSEO] HTTP status text:', error.response.statusText);
      console.error('[DataForSEO] Response body:', JSON.stringify(error.response.data, null, 2));
      
      // Extract task-level errors if available
      if (error.response.data?.tasks && Array.isArray(error.response.data.tasks)) {
        error.response.data.tasks.forEach((task, index) => {
          if (task.status_code !== 20000) {
            console.error(`[DataForSEO] Task ${index} error:`, {
              status_code: task.status_code,
              status_message: task.status_message,
              result_count: task.result_count
            });
          }
        });
      }
    } else if (error.request) {
      console.error('[DataForSEO] No response received, request:', error.request);
    } else {
      console.error('[DataForSEO] Error detail:', error);
    }
    
    // Also log structured error details
    const errorDetails = {
      httpStatus: error.response?.status,
      httpStatusText: error.response?.statusText,
      apiStatusCode: error.response?.data?.status_code,
      apiStatusMessage: error.response?.data?.status_message,
      tasksError: error.response?.data?.tasks_error,
      tasks: error.response?.data?.tasks,
      fullResponse: error.response?.data,
      errorMessage: error.message,
      errorCode: error.code, // e.g., ECONNREFUSED, ETIMEDOUT
    };
    console.error('[DataForSEO] API Error Details:', JSON.stringify(errorDetails, null, 2));
    
    // Check for network errors first
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      throw new Error(`Network error connecting to DataForSEO API: ${error.message}. Check firewall/proxy settings.`);
    }
    
    // Check if the response actually indicates success (status_code 20000)
    // Sometimes axios throws errors even for successful responses (e.g., timeout during processing)
    // Check both top-level and task-level status codes
    // Convert to number to handle string/number type mismatches
    const topLevelStatusCode = error.response?.data?.status_code;
    const taskStatusCode = error.response?.data?.tasks?.[0]?.status_code;
    const statusCodeNum = Number(topLevelStatusCode) || Number(taskStatusCode);
    const statusCode = statusCodeNum || topLevelStatusCode || taskStatusCode; // Keep original for logging
    
    // If status_code is 20000 (success), return the response data instead of throwing
    // Check both numeric and string comparisons to handle type mismatches
    if (statusCodeNum === 20000 || statusCode === '20000' || statusCode === 20000) {
      // This is actually a success response, return it instead of throwing
      console.warn('[DataForSEO] Axios error but status_code is 20000 (success), returning response data');
      console.warn('[DataForSEO] Status code details:', {
        topLevel: topLevelStatusCode,
        taskLevel: taskStatusCode,
        converted: statusCodeNum,
        original: statusCode
      });
      return error.response.data;
    }
    
    // Extract DataForSEO-specific error information
    const dataForSEOMessage = error.response?.data?.status_message || 
                              error.response?.data?.tasks?.[0]?.status_message ||
                              error.response?.data?.message || 
                              error.response?.data?.error?.message;
    
    const errorMessage = dataForSEOMessage || 
                        error.message || 
                        'DataForSEO API call failed';
    
    // Only throw error with status code if it's NOT 20000 (success)
    // Use numeric comparison to handle type mismatches
    // If statusCode is 20000, we should have returned above, so this shouldn't happen
    // But if it does, just throw the error message without the status code
    if (statusCode && statusCodeNum !== 20000 && statusCode !== '20000' && statusCode !== 20000) {
      throw new Error(`DataForSEO API error (${statusCode}): ${errorMessage}`);
    }
    
    // If no status code or status code is 20000 (shouldn't reach here), throw generic error
    throw new Error(errorMessage);
  }
}

/**
 * Keyword Overview endpoint
 */
router.post('/api/mcp/DataForSEO_dataforseo_labs_google_keyword_overview', async (req, res) => {
  try {
    const { keywords, location_name, language_code } = req.body;
    
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({
        error: 'keywords array is required',
        tool: 'DataForSEO_dataforseo_labs_google_keyword_overview'
      });
    }
    
    const locationCode = LOCATION_MAP[location_name] || 2840;
    // DataForSEO Labs endpoints require language_code as string (e.g., "en"), not numeric
    const langCode = ensureLanguageCode(language_code);
    
    // DataForSEO API expects an array of task objects
    // CRITICAL: Must be array format [{...}], not plain object {...}
    // CRITICAL: language_code must be string "en", not numeric 1000
    const data = [{
      keywords: keywords,
      location_code: locationCode,
      language_code: langCode, // String "en", not numeric
    }];
    
    // Verify request format before sending
    if (!Array.isArray(data)) {
      throw new Error('Request body must be an array of task objects');
    }
    if (typeof data[0].language_code !== 'string') {
      throw new Error('language_code must be a string (e.g., "en"), not numeric');
    }
    
    console.log('[DataForSEO] Calling keyword overview with:', JSON.stringify(data, null, 2));
    // keyword_overview is often slow; use 60s timeout so Death Star / optimization flow doesn't fail
    const result = await callDataForSEO('/dataforseo_labs/google/keyword_overview/live', data, { timeout: 60000 });
    
    // Log the full result structure for debugging
    console.log('[DataForSEO] Full result structure:', JSON.stringify(result, null, 2));
    
    // Check if result has errors
    if (result.tasks && result.tasks[0]) {
      const task = result.tasks[0];
      
      console.log('[DataForSEO] Task details:', {
        status_code: task.status_code,
        status_message: task.status_message,
        result_count: task.result_count,
        has_result: !!task.result,
        result_type: Array.isArray(task.result) ? 'array' : typeof task.result,
        result_length: Array.isArray(task.result) ? task.result.length : 'N/A'
      });
      
      // Log first result item structure if available
      if (task.result && Array.isArray(task.result) && task.result.length > 0) {
        console.log('[DataForSEO] First result item keys:', Object.keys(task.result[0]));
        console.log('[DataForSEO] First result item:', JSON.stringify(task.result[0], null, 2));
      }
      
      // Check for empty results
      if (task.result_count === 0 || !task.result || (Array.isArray(task.result) && task.result.length === 0)) {
        console.warn('[DataForSEO] No results returned for keywords:', keywords);
        console.warn('[DataForSEO] Task status:', {
          status_code: task.status_code,
          status_message: task.status_message,
          result_count: task.result_count
        });
        // Still return the result so frontend can see the status
        return res.json(result);
      }
      
      // Check status_code first (20000 = success)
      if (task.status_code && task.status_code !== 20000) {
        const errorMsg = task.status_message || `DataForSEO API error code: ${task.status_code}`;
        console.error('[DataForSEO] API error code:', task.status_code, errorMsg);
        throw new Error(errorMsg);
      }
      
      // Check status_message - accept "Ok", "Ok.", or empty (all indicate success when status_code is 20000)
      // Only throw if status_message exists AND is not a success indicator
      if (task.status_message && 
          task.status_message !== 'Ok' && 
          task.status_message !== 'Ok.' && 
          task.status_code === 20000) {
        // If status_code is 20000, status_message variations are acceptable
        // Only log a warning, don't throw
        console.warn('[DataForSEO] Unexpected status_message with success code:', task.status_message);
      }
    } else {
      console.warn('[DataForSEO] No tasks in response:', {
        has_tasks: !!result.tasks,
        tasks_type: typeof result.tasks,
        top_level_keys: Object.keys(result)
      });
    }
    
    console.log('[DataForSEO] Sending response to frontend:', {
      has_tasks: !!result.tasks,
      tasks_count: result.tasks?.length,
      first_task_has_result: result.tasks?.[0]?.result ? 'yes' : 'no'
    });
    
    res.json(result);
  } catch (error) {
    console.error('[DataForSEO] Keyword overview error:', error);
    console.error('[DataForSEO] Error stack:', error.stack);
    
    // Determine HTTP status code
    let statusCode = 500;
    if (error.response?.status) {
      statusCode = error.response.status;
    } else if (error.message?.includes('Network error')) {
      statusCode = 503; // Service unavailable
    } else if (error.message?.includes('must be')) {
      statusCode = 400; // Bad request
    }
    
    // Build error response
    const errorResponse = {
      error: error.message || 'Internal server error',
      tool: 'DataForSEO_dataforseo_labs_google_keyword_overview',
      details: error.response?.data || null,
    };
    
    // Include stack trace in development
    if (process.env.NODE_ENV === 'development') {
      errorResponse.stack = error.stack;
      errorResponse.errorDetails = {
        name: error.name,
        message: error.message,
        code: error.code,
      };
    }
    
    res.status(statusCode).json(errorResponse);
  }
});

/**
 * Keyword Ideas endpoint
 */
router.post('/api/mcp/DataForSEO_dataforseo_labs_google_keyword_ideas', async (req, res) => {
  try {
    const { keywords, location_name, language_code, limit } = req.body;
    
    const locationCode = LOCATION_MAP[location_name] || 2840;
    // DataForSEO Labs endpoints require language_code as string (e.g., "en"), not numeric
    const langCode = ensureLanguageCode(language_code);
    
    const data = [{
      keywords: keywords,
      location_code: locationCode,
      language_code: langCode,
      limit: limit || 20,
    }];
    
    const result = await callDataForSEO('/dataforseo_labs/google/keyword_ideas/live', data);
    
    // Check for errors in result
    if (result.tasks && result.tasks[0]) {
      const task = result.tasks[0];
      if (task.status_code && task.status_code !== 20000) {
        const errorMsg = task.status_message || `DataForSEO API error code: ${task.status_code}`;
        throw new Error(errorMsg);
      }
    }
    
    res.json(result);
  } catch (error) {
    console.error('[DataForSEO] Keyword ideas error:', error);
    const statusCode = error.response?.status || 500;
    res.status(statusCode).json({
      error: error.message,
      tool: 'DataForSEO_dataforseo_labs_google_keyword_ideas',
      details: error.response?.data || null
    });
  }
});

/**
 * Related Keywords endpoint
 */
router.post('/api/mcp/DataForSEO_dataforseo_labs_google_related_keywords', async (req, res) => {
  try {
    const { keyword, location_name, language_code, limit } = req.body;
    
    const locationCode = LOCATION_MAP[location_name] || 2840;
    // DataForSEO Labs endpoints require language_code as string (e.g., "en"), not numeric
    const langCode = ensureLanguageCode(language_code);
    
    const data = [{
      keyword: keyword,
      location_code: locationCode,
      language_code: langCode,
      depth: limit ? Math.min(limit, 4) : 1, // depth 1-4
    }];
    
    const result = await callDataForSEO('/dataforseo_labs/google/related_keywords/live', data);
    
    // Check for errors in result
    if (result.tasks && result.tasks[0]) {
      const task = result.tasks[0];
      if (task.status_code && task.status_code !== 20000) {
        const errorMsg = task.status_message || `DataForSEO API error code: ${task.status_code}`;
        throw new Error(errorMsg);
      }
    }
    
    res.json(result);
  } catch (error) {
    console.error('[DataForSEO] Related keywords error:', error);
    const statusCode = error.response?.status || 500;
    res.status(statusCode).json({
      error: error.message,
      tool: 'DataForSEO_dataforseo_labs_google_related_keywords',
      details: error.response?.data || null
    });
  }
});

/**
 * SERP Organic Live Advanced endpoint
 * Supports people_also_ask_click_depth parameter for maximum PAA questions
 */
router.post('/api/mcp/DataForSEO_serp_organic_live_advanced', async (req, res) => {
  try {
    // Use EXACT same pattern as keyword_overview endpoint - destructure only what we need
    // CRITICAL: Do NOT destructure language_name - SERP endpoints reject this field
    const { keyword, location_name, language_code, depth, people_also_ask_click_depth } = req.body;
    
    // API Parameter Verification: Log people_also_ask_click_depth
    console.log('[DataForSEO] API Parameter Verification: people_also_ask_click_depth received:', {
      value: people_also_ask_click_depth,
      type: typeof people_also_ask_click_depth,
      isPresent: 'people_also_ask_click_depth' in req.body,
    });
    
    if (people_also_ask_click_depth !== undefined) {
      console.log('[DataForSEO] people_also_ask_click_depth parameter will be included in Advanced endpoint request');
    }
    
    // CRITICAL: Log and strip language_name if present in incoming request
    // This is the first line of defense - catch it before processing
    if ('language_name' in req.body) {
      console.warn('[DataForSEO] WARNING: Frontend sent language_name in request body (will be ignored and removed):', {
        language_name: req.body.language_name,
        language_code: req.body.language_code,
        all_keys: Object.keys(req.body),
        endpoint: 'DataForSEO_serp_organic_live_advanced'
      });
      // Explicitly delete it to prevent any accidental inclusion
      delete req.body.language_name;
    }
    
    // Log all incoming request body keys for debugging
    console.log('[DataForSEO] Incoming request body keys:', Object.keys(req.body));
    
    if (!keyword) {
      return res.status(400).json({
        error: 'keyword is required',
        tool: 'DataForSEO_serp_organic_live_advanced'
      });
    }
    
    const locationCode = LOCATION_MAP[location_name] || 2840;
    // SERP endpoints require language_code as string (e.g., "en"), NOT language_name
    const langCode = ensureLanguageCode(language_code);
    
    // Fix 3: Validate required parameters before sending request
    // DataForSEO silently accepts undefined values but returns empty results
    if (!locationCode || typeof locationCode !== 'number') {
      console.error('[DataForSEO] Invalid location_code:', {
        location_name,
        locationCode,
        available_locations: Object.keys(LOCATION_MAP)
      });
      return res.status(400).json({
        error: 'Invalid location_name or location_code',
        tool: 'DataForSEO_serp_organic_live_advanced',
        details: {
          location_name,
          locationCode,
          available_locations: Object.keys(LOCATION_MAP)
        }
      });
    }
    
    if (!langCode || typeof langCode !== 'string' || langCode.trim().length === 0) {
      console.error('[DataForSEO] Invalid language_code:', {
        language_code,
        langCode,
        type: typeof langCode
      });
      return res.status(400).json({
        error: 'Invalid language_code - must be a non-empty string (e.g., "en")',
        tool: 'DataForSEO_serp_organic_live_advanced',
        details: {
          language_code,
          langCode,
          type: typeof langCode
        }
      });
    }
    
    // Log validation success
    console.log('[DataForSEO] SERP request validation passed:', {
      keyword,
      location_code: locationCode,
      language_code: langCode,
      depth: depth || 10,
      people_also_ask_click_depth_received: people_also_ask_click_depth,
      people_also_ask_click_depth_will_be_used: people_also_ask_click_depth !== undefined,
      endpoint_used: 'advanced',
    });
    
    // CRITICAL: Use EXACT same pattern as keyword_overview - explicitly construct array with object literal
    // Do NOT use spread operator or include any other fields from req.body
    // DataForSEO API expects an array of task objects - SAME as keyword_overview
    // Build payload explicitly - NO spreads, NO language_name, create completely fresh object
    const taskObj = {};
    taskObj.keyword = String(keyword);
    taskObj.location_code = Number(locationCode);
    taskObj.language_code = String(langCode); // String "en", required by API - DO NOT use language_name
    taskObj.depth = Number(depth || 10);
    taskObj.device = 'desktop';
    taskObj.os = 'windows';
    
    // Advanced endpoint supports people_also_ask_click_depth for maximum PAA questions
    if (people_also_ask_click_depth !== undefined) {
      taskObj.people_also_ask_click_depth = Number(people_also_ask_click_depth);
    }
    
    // Wrap in array as required by DataForSEO API - SAME pattern as keyword_overview
    // Create fresh array - taskObj is already a fresh object with only allowed fields
    let data = [taskObj];
    
    // CRITICAL: Apply sanitization as an additional safety layer
    // This ensures language_name is removed even if it somehow got into taskObj
    data = sanitizeDataForSEOPayload(data);
    
    // CRITICAL GUARD: Deep check for language_name anywhere in payload
    if (containsKeyDeep(data, 'language_name')) {
      console.error('[DataForSEO] CRITICAL: language_name detected in payload (deep check)!', {
        payload: JSON.stringify(data, null, 2),
        req_body_keys: Object.keys(req.body),
        taskObj_keys: Object.keys(taskObj)
      });
      throw new Error('language_name detected in DataForSEO payload - this field is not allowed for SERP endpoints');
    }
    
    // Additional guard: Check for any unexpected fields that might cause issues
    // Advanced endpoint supports these fields including people_also_ask_click_depth
    const allowedFields = ['keyword', 'location_code', 'language_code', 'depth', 'device', 'os', 'people_also_ask_click_depth'];
    const payloadKeys = Object.keys(data[0]);
    const unexpectedFields = payloadKeys.filter(key => !allowedFields.includes(key));
    if (unexpectedFields.length > 0) {
      console.error('[DataForSEO] CRITICAL: Unexpected fields in payload:', {
        unexpectedFields,
        fullPayload: data[0],
        allowedFields
      });
      throw new Error(`Unexpected fields in DataForSEO payload: ${unexpectedFields.join(', ')}. This may cause API rejection.`);
    }
    
    // Log that people_also_ask_click_depth is included if present
    if (people_also_ask_click_depth !== undefined) {
      console.log('[DataForSEO] people_also_ask_click_depth parameter included in payload:', people_also_ask_click_depth);
      console.log('[DataForSEO] This will enable maximum PAA questions (up to 4 clicks deep)');
    }
    
    // Final validation: Log exact payload structure before sending
    console.log('[DataForSEO] Final validated payload structure:', {
      keys: Object.keys(data[0]),
      has_language_name: 'language_name' in data[0],
      has_language_code: 'language_code' in data[0],
      language_code_value: data[0].language_code,
      payload: JSON.stringify(data, null, 2)
    });
    
    // ABSOLUTE FINAL CHECK: Deep search for language_name anywhere
    if (containsKeyDeep(data, 'language_name')) {
      const errorMsg = 'CRITICAL: language_name detected in final payload after sanitization (deep check). This should never happen.';
      console.error('[DataForSEO]', errorMsg, {
        payload: JSON.stringify(data, null, 2)
      });
      return res.status(500).json({
        error: errorMsg,
        tool: 'DataForSEO_serp_organic_live_advanced',
        details: { 
          payload: data[0],
          message: 'The language_name field was detected in the payload. This field is not accepted by DataForSEO SERP endpoints. Use language_code instead (e.g., "en").'
        }
      });
    }
    
    // callDataForSEO will apply sanitization again as a final safety net
    // Using Advanced endpoint to support people_also_ask_click_depth for maximum PAA questions
    console.log('[DataForSEO] Calling DataForSEO API endpoint: /serp/google/organic/live/advanced');
    console.log('[DataForSEO] Endpoint type: Advanced (supports people_also_ask_click_depth)');
    if (people_also_ask_click_depth !== undefined) {
      console.log('[DataForSEO] people_also_ask_click_depth parameter will be sent to API:', people_also_ask_click_depth);
    }
    const result = await callDataForSEO('/serp/google/organic/live/advanced', data);
    
    // Log API response for PAA validation
    if (result.tasks && result.tasks[0]?.result) {
      const task = result.tasks[0];
      let paaCount = 0;
      if (Array.isArray(task.result)) {
        for (const resultItem of task.result) {
          if (resultItem.items && Array.isArray(resultItem.items)) {
            for (const item of resultItem.items) {
              if (item.type === 'people_also_ask' || item.type === 'people_also_ask_item') {
                paaCount++;
              }
            }
          }
        }
      }
      console.log('[DataForSEO] API response validation: PAA items found in response:', paaCount);
      // Skip warning if no PAA items found (paaCount === 0)
      // Warning condition removed: if no PAA items, skip the conditional warning
    }
    
    // Check for errors in result
    if (result.tasks && result.tasks[0]) {
      const task = result.tasks[0];
      if (task.status_code && task.status_code !== 20000) {
        const errorMsg = task.status_message || `DataForSEO API error code: ${task.status_code}`;
        throw new Error(errorMsg);
      }
    }
    
    res.json(result);
  } catch (error) {
    console.error('[DataForSEO] SERP analysis error:', error);
    const statusCode = error.response?.status || 500;
    res.status(statusCode).json({
      error: error.message,
      tool: 'DataForSEO_serp_organic_live_advanced',
      details: error.response?.data || null
    });
  }
});

/**
 * On-Page Content Parsing endpoint
 */
router.post('/api/mcp/DataForSEO_on_page_content_parsing', async (req, res) => {
  try {
    const { url, enable_javascript, accept_language } = req.body;
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        error: 'url is required and must be a string',
        tool: 'DataForSEO_on_page_content_parsing'
      });
    }
    
    // DataForSEO API expects an array of task objects
    const data = [{
      url: url,
      enable_javascript: enable_javascript !== undefined ? enable_javascript : false,
      accept_language: accept_language || 'en',
    }];
    
    console.log('[DataForSEO] Calling On-Page Content Parsing with:', JSON.stringify(data, null, 2));
    
    const result = await callDataForSEO('/on_page/content_parsing', data);
    
    // Check for errors in result
    if (result.tasks && result.tasks[0]) {
      const task = result.tasks[0];
      if (task.status_code && task.status_code !== 20000) {
        const errorMsg = task.status_message || `DataForSEO API error code: ${task.status_code}`;
        throw new Error(errorMsg);
      }
    }
    
    res.json(result);
  } catch (error) {
    console.error('[DataForSEO] On-Page Content Parsing error:', error);
    const statusCode = error.response?.status || 500;
    res.status(statusCode).json({
      error: error.message,
      tool: 'DataForSEO_on_page_content_parsing',
      details: error.response?.data || null
    });
  }
});

/**
 * Page Intersection endpoint
 */
router.post('/api/mcp/DataForSEO_dataforseo_labs_google_page_intersection', async (req, res) => {
  try {
    const { pages, location_name, language_code, intersection_mode } = req.body;
    
    if (!pages || !Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({
        error: 'pages array is required and must contain at least one URL',
        tool: 'DataForSEO_dataforseo_labs_google_page_intersection'
      });
    }
    
    // Validate URLs
    for (const page of pages) {
      if (typeof page !== 'string' || (!page.startsWith('http://') && !page.startsWith('https://'))) {
        return res.status(400).json({
          error: `Invalid URL format: ${page}. URLs must be absolute and include http:// or https://`,
          tool: 'DataForSEO_dataforseo_labs_google_page_intersection'
        });
      }
    }
    
    // Limit to 20 pages as per DataForSEO API
    if (pages.length > 20) {
      return res.status(400).json({
        error: 'Maximum 20 pages allowed per request',
        tool: 'DataForSEO_dataforseo_labs_google_page_intersection'
      });
    }
    
    const locationCode = LOCATION_MAP[location_name] || 2840;
    const langCode = ensureLanguageCode(language_code);
    const mode = intersection_mode || 'intersect';
    
    if (mode !== 'intersect' && mode !== 'union') {
      return res.status(400).json({
        error: 'intersection_mode must be either "intersect" or "union"',
        tool: 'DataForSEO_dataforseo_labs_google_page_intersection'
      });
    }
    
    // DataForSEO API expects an array of task objects
    const data = [{
      pages: pages,
      location_code: locationCode,
      language_code: langCode,
      intersection_mode: mode,
    }];
    
    console.log('[DataForSEO] Calling page intersection with:', JSON.stringify(data, null, 2));
    
    const result = await callDataForSEO('/dataforseo_labs/google/page_intersection/live', data);
    
    // Check for errors in result
    if (result.tasks && result.tasks[0]) {
      const task = result.tasks[0];
      if (task.status_code && task.status_code !== 20000) {
        const errorMsg = task.status_message || `DataForSEO API error code: ${task.status_code}`;
        throw new Error(errorMsg);
      }
    }
    
    res.json(result);
  } catch (error) {
    console.error('[DataForSEO] Page intersection error:', error);
    const statusCode = error.response?.status || 500;
    res.status(statusCode).json({
      error: error.message,
      tool: 'DataForSEO_dataforseo_labs_google_page_intersection',
      details: error.response?.data || null
    });
  }
});

module.exports = router;


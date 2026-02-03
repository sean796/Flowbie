# DataForSEO 500 Error Troubleshooting Guide

**Issue:** `Failed to get keyword overview: MCP API error (500): . Please ensure MCP server is configured with DataForSEO credentials.`

**Date:** December 2024  
**Status:** Active Investigation

**Credentials:**
- API Login: `YOUR_DATAFORSEO_LOGIN`
- API Password: `YOUR_DATAFORSEO_PASSWORD`

---

## ⚠️ CRITICAL FIXES REQUIRED

### Fix 1: Authorization Header (MUST FIX)
**Problem:** Base64 token must be continuous with NO spaces or newlines.

**Current (WRONG):**
```
Authorization: Basic c2VhbkBvZGlu d2ViM2xhYnMuY29tOmZj...
```

**Correct:**
```javascript
// In server/mcp-api-server.js line 25
const auth = Buffer.from(`${DATAFORSEO_CREDENTIALS.api_login}:${DATAFORSEO_CREDENTIALS.api_password}`).toString('base64');
// Result: c2VhbkBvZGlud2ViM2xhYnMuY29tOmZjMTU0ZjMzOTdiOGM2ZDI=
// NO SPACES in the Base64 string
```

### Fix 2: Language Code Type (MUST FIX)
**Problem:** DataForSEO Labs endpoints require `language_code` as STRING (`"en"`), NOT numeric (`1000`).

**Current (WRONG):**
```javascript
const langCode = LANGUAGE_MAP[language_code] || 1000; // ❌ WRONG
```

**Correct:**
```javascript
const langCode = language_code || 'en'; // ✅ CORRECT - use string directly
```

### Fix 3: Request Body Format (MUST FIX)
**Problem:** Must be JSON array of task objects, not a plain object.

**Correct Format:**
```json
[{
  "keywords": ["test keyword"],
  "location_code": 2840,
  "language_code": "en"
}]
```

---

## Quick Diagnosis Checklist

- [ ] Backend server is running on `http://localhost:3001`
- [ ] Authorization header Base64 has NO spaces/newlines
- [ ] `language_code` is sent as string `"en"` (not numeric `1000`)
- [ ] Request body is JSON array `[{...}]` (not plain object `{...}`)
- [ ] Backend server logs show the request being received
- [ ] DataForSEO API credentials are correct
- [ ] Network connectivity to `https://api.dataforseo.com` is working
- [ ] No firewall/proxy blocking the request

---

## Step 1: Verify Backend Server is Running

### Check if server is running:
```bash
# Test health endpoint
curl http://localhost:3001/api/mcp/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "message": "MCP API server is running",
  "credentials": {
    "api_login": "YOUR_DATAFORSEO_LOGIN",
    "configured": true
  }
}
```

**If server is not running:**
```bash
# Navigate to project directory
cd "b:\Agent Operators\Agent Operators\Flowbie 2\agent-blueprint-builder-main\agent-blueprint-builder-main"

# Start the server
node server/mcp-api-server.js
```

**Expected server output:**
```
✅ MCP API server running on http://localhost:3001
📊 DataForSEO credentials configured for: YOUR_DATAFORSEO_LOGIN

🔗 Available endpoints:
   POST /api/mcp/DataForSEO_dataforseo_labs_google_keyword_overview
   POST /api/mcp/DataForSEO_dataforseo_labs_google_keyword_ideas
   POST /api/mcp/DataForSEO_dataforseo_labs_google_related_keywords
   POST /api/mcp/DataForSEO_dataforseo_labs_search_intent
   POST /api/mcp/DataForSEO_serp_organic_live_advanced
   GET  /api/mcp/health
```

---

## Step 2: Test Backend Endpoint Directly

### Test with curl:
```bash
# Test backend endpoint (sends to your MCP proxy)
curl -X POST "http://localhost:3001/api/mcp/DataForSEO_dataforseo_labs_google_keyword_overview" \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["test keyword"],
    "location_name": "United States",
    "language_code": "en"
  }'
```

**Check the response:**
- **If you get 500:** Check server console logs for:
  - Outgoing request headers (Authorization header format)
  - Outgoing request body (verify it's an array with `language_code: "en"`)
  - Full DataForSEO response (status_code, status_message, tasks[].status_code)
- **If you get 200 with error:** Note the DataForSEO `status_code` and `status_message` in response
- **If you get connection refused:** Server is not running - start with `node server/mcp-api-server.js`

**What to look for in server logs:**
```
[DataForSEO] Calling API: /dataforseo_labs/google/keyword_overview/live
[DataForSEO] Request body: [{"keywords":["test keyword"],"location_code":2840,"language_code":"en"}]
[DataForSEO] Response Status: 200
[DataForSEO] API Status: 20000 - Ok.
```

**If you see errors:**
- `status_code: 40101` → Authentication failed (check Authorization header)
- `status_code: 40001` → Invalid parameter (check language_code is string "en")
- `status_code: 50001` → DataForSEO internal error (retry or contact support)

---

## Step 3: Check Server Logs (CRITICAL FOR DIAGNOSIS)

### What to log in your server (add if missing):
Your server should log:
1. **Outgoing request headers** (Authorization header - Base64 string is OK to log for debugging)
2. **Outgoing request body** (exact JSON being sent)
3. **Full HTTP response code** from DataForSEO
4. **Full response body** from DataForSEO (contains `status_code`, `status_message`, `tasks[]`)

### What to look for in server logs:

1. **Request received:**
```
[DataForSEO] Calling API: /dataforseo_labs/google/keyword_overview/live
[DataForSEO] Request body: [{"keywords":["test keyword"],"location_code":2840,"language_code":"en"}]
```

2. **Response received:**
```
[DataForSEO] Response Status: 200
[DataForSEO] API Status: 20000 - Ok.
[DataForSEO] Tasks: 1 total, 0 errors
```

3. **Error indicators:**
```
[DataForSEO] API Error Details: {...}
[DataForSEO] API returned error: ...
[DataForSEO] API error code: ...
```

### Common log patterns:

**Pattern 1: Network/Connection Error**
```
[DataForSEO] API Error Details: {
  "status": undefined,
  "message": "ECONNREFUSED" or "ETIMEDOUT"
}
```
**Solution:** Check internet connection, firewall, or DataForSEO API status

**Pattern 2: Authentication Error**
```
[DataForSEO] API Error Details: {
  "status": 401,
  "data": { "status_code": 40101, "status_message": "Unauthorized" }
}
```
**Solution:** Verify credentials are correct in `server/mcp-api-server.js`

**Pattern 3: Invalid Request Format**
```
[DataForSEO] API Error Details: {
  "status": 400,
  "data": { "status_code": 40001, "status_message": "Invalid parameter" }
}
```
**Solution:** Check request body format matches DataForSEO requirements

**Pattern 4: DataForSEO API Error**
```
[DataForSEO] API Status: 50001 - Internal Server Error
[DataForSEO] Task 0 error: {
  "status_code": 50001,
  "status_message": "Internal server error"
}
```
**Solution:** 
- If `status_code: 50001` or `50002` → DataForSEO server-side issue
- Retry after 30-60 seconds
- If persistent, collect full response JSON and contact DataForSEO support

**Pattern 5: Malformed Request (Check These)**
```
[DataForSEO] Request body: {"keywords":["test"],"language_code":1000}  // ❌ WRONG - not array, numeric language_code
```
**Solution:** 
- Must be array: `[{"keywords":["test"],"language_code":"en"}]`
- `language_code` must be string: `"en"` not `1000`

---

## Step 4: Test DataForSEO API Directly (Bypass Your Backend)

### Generate Base64 auth (NO spaces/newlines):
```bash
# Generate Base64 - must be continuous with no spaces
cred="$(printf '%s:%s' 'YOUR_DATAFORSEO_LOGIN' 'YOUR_DATAFORSEO_PASSWORD' | base64)"
echo "$cred"
# Should output: c2VhbkBvZGlud2ViM2xhYnMuY29tOmZjMTU0ZjMzOTdiOGM2ZDI=
# Verify there are NO spaces in the output
```

### Test DataForSEO API directly:
```bash
# Use the $cred variable from above
curl -X POST "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_overview/live" \
  -H "Authorization: Basic $cred" \
  -H "Content-Type: application/json" \
  -d '[{
    "keywords": ["test keyword"],
    "location_code": 2840,
    "language_code": "en"
  }]'
```

**Expected successful response:**
```json
{
  "version": "0.1.20231218",
  "status_code": 20000,
  "status_message": "Ok.",
  "tasks": [
    {
      "id": "...",
      "status_code": 20000,
      "status_message": "Ok.",
      "result": [...]
    }
  ]
}
```

**Expected successful response:**
```json
{
  "version": "0.1.20231218",
  "status_code": 20000,
  "status_message": "Ok.",
  "tasks": [
    {
      "id": "...",
      "status_code": 20000,
      "status_message": "Ok.",
      "result": [...]
    }
  ]
}
```

**If you get 401 Unauthorized:**
- **Check 1:** Authorization header Base64 has no spaces
  ```bash
  # Verify Base64 encoding
  echo "$cred" | grep -q " " && echo "ERROR: Contains space!" || echo "OK: No spaces"
  ```
- **Check 2:** Credentials are correct
  - Login: `YOUR_DATAFORSEO_LOGIN`
  - Password: `YOUR_DATAFORSEO_PASSWORD`
  - Check DataForSEO dashboard: https://app.dataforseo.com/api-access
- **Check 3:** Account is active and has credits

**If you get 500 Internal Server Error:**
- **Check 1:** Verify request format is correct (array, string language_code)
- **Check 2:** Try minimal request (single ASCII keyword)
- **Check 3:** Wait 30-60 seconds and retry (transient server issues)
- **Check 4:** If persistent, check response JSON for `status_code`:
  - `50001` or `50002` → DataForSEO internal error, contact support
  - Collect full response JSON and contact DataForSEO support

**If you get 400 Bad Request:**
- **Check 1:** `language_code` must be string `"en"` (NOT numeric `1000`)
- **Check 2:** Request body must be JSON array `[{...}]` (NOT plain object `{...}`)
- **Check 3:** `location_code` must be valid number (2840 for United States)
- **Check 4:** `keywords` must be array of strings
- **Check 5:** No extra fields or malformed JSON

---

## Step 5: Verify Request Format (CRITICAL)

### Correct request format for keyword_overview:
**What your backend sends to DataForSEO:**
```json
[
  {
    "keywords": ["keyword1", "keyword2"],
    "location_code": 2840,
    "language_code": "en"
  }
]
```

**Key requirements:**
1. ✅ Must be JSON **array** `[{...}]` (NOT plain object `{...}`)
2. ✅ `language_code` must be **string** `"en"` (NOT numeric `1000`)
3. ✅ `location_code` must be **number** `2840`
4. ✅ `keywords` must be **array of strings** `["keyword1", "keyword2"]`

### Common mistakes:

❌ **Wrong: Numeric language_code**
```json
{
  "language_code": 1000  // WRONG - Labs endpoints need string
}
```

✅ **Correct: String language_code**
```json
{
  "language_code": "en"  // CORRECT
}
```

❌ **Wrong: Missing array wrapper**
```json
{
  "keywords": ["test"],
  "location_code": 2840,
  "language_code": "en"
}
```

✅ **Correct: Array of task objects**
```json
[{
  "keywords": ["test"],
  "location_code": 2840,
  "language_code": "en"
}]
```

---

## Step 6: Verify Credentials and Authorization Header

### Check credentials in server file:
**File:** `server/mcp-api-server.js`  
**Lines:** 17-20

```javascript
const DATAFORSEO_CREDENTIALS = {
  api_login: 'YOUR_DATAFORSEO_LOGIN',
  api_password: 'YOUR_DATAFORSEO_PASSWORD'
};
```

### Verify Base64 encoding (NO SPACES):
```bash
node -e "console.log(Buffer.from('YOUR_DATAFORSEO_LOGIN:YOUR_DATAFORSEO_PASSWORD').toString('base64'))"
```

**Expected output (single continuous string, NO spaces):**
```
c2VhbkBvZGlud2ViM2xhYnMuY29tOmZjMTU0ZjMzOTdiOGM2ZDI=
```

**Verify in server code (line 25):**
```javascript
// ✅ CORRECT - produces continuous Base64 with no spaces
const auth = Buffer.from(`${DATAFORSEO_CREDENTIALS.api_login}:${DATAFORSEO_CREDENTIALS.api_password}`).toString('base64');

// ❌ WRONG - would add spaces/newlines
const auth = Buffer.from(`${login}\n:${password}`).toString('base64'); // Has newline
const auth = `${base64String} `; // Has trailing space
```

**Verify Authorization header format (line 57):**
```javascript
// ✅ CORRECT
headers: {
  'Authorization': `Basic ${auth}`,  // auth is continuous Base64 string
  'Content-Type': 'application/json',
}

// ❌ WRONG - would break auth
'Authorization': `Basic ${auth} `,  // Trailing space
'Authorization': `Basic\n${auth}`,  // Newline
```

### Test credentials with DataForSEO:
1. Log into DataForSEO dashboard: https://app.dataforseo.com
2. Go to API Access section
3. Verify API login and password match
4. Check if account has available credits/quota
5. Verify account is active (not suspended)

---

## Step 7: Debug Frontend to Backend Communication

### Check browser console for errors:
1. Open browser DevTools (F12)
2. Go to Network tab
3. Trigger keyword research
4. Look for request to `http://localhost:3001/api/mcp/DataForSEO_dataforseo_labs_google_keyword_overview`

### Check request details:
- **Request URL:** Should be `http://localhost:3001/api/mcp/...`
- **Request Method:** Should be `POST`
- **Request Headers:** Should include `Content-Type: application/json`
- **Request Payload:** Should match expected format

### Check response:
- **Status Code:** 200 (success) or 500 (error)
- **Response Body:** Should contain error details if 500

### Common frontend issues:

**Issue: CORS Error**
```
Access to fetch at 'http://localhost:3001/...' from origin '...' has been blocked by CORS policy
```
**Solution:** Verify `app.use(cors())` is in `server/mcp-api-server.js` (line 27)

**Issue: Connection Refused**
```
Failed to fetch
net::ERR_CONNECTION_REFUSED
```
**Solution:** Backend server is not running - start it with `node server/mcp-api-server.js`

**Issue: 404 Not Found**
```
404 Not Found
```
**Solution:** Check endpoint path matches exactly: `/api/mcp/DataForSEO_dataforseo_labs_google_keyword_overview`

---

## Step 8: Verify Code Changes

### Check recent fixes are applied:

1. **Language code format** (`server/mcp-api-server.js` line ~97):
```javascript
// Should be:
const langCode = language_code || 'en';

// NOT:
const langCode = LANGUAGE_MAP[language_code] || 1000;
```

2. **Authorization header** (`server/mcp-api-server.js` line ~57):
```javascript
// Should be:
'Authorization': `Basic ${auth}`

// Where auth is generated correctly (line 25):
const auth = Buffer.from(`${DATAFORSEO_CREDENTIALS.api_login}:${DATAFORSEO_CREDENTIALS.api_password}`).toString('base64');
```

3. **Error logging** - Should see `[DataForSEO]` prefixed logs in console

---

## Step 9: Collect Debug Information

### When reporting the issue, collect:

1. **Backend server logs** (full output from console)
2. **Browser console errors** (screenshot or copy/paste)
3. **Network request/response** (from browser DevTools Network tab)
4. **Test curl command output** (from Step 2 and Step 4)
5. **Server version:**
   ```bash
   node --version
   npm list express cors axios
   ```

### Create a test script:
```bash
# Save as test-dataforseo.sh
#!/bin/bash

echo "=== Testing Backend Server ==="
curl -s http://localhost:3001/api/mcp/health | jq .

echo -e "\n=== Testing Backend Endpoint ==="
curl -s -X POST "http://localhost:3001/api/mcp/DataForSEO_dataforseo_labs_google_keyword_overview" \
  -H "Content-Type: application/json" \
  -d '{"keywords":["test"],"location_name":"United States","language_code":"en"}' | jq .

echo -e "\n=== Testing DataForSEO API Directly ==="
cred="$(printf '%s:%s' 'YOUR_DATAFORSEO_LOGIN' 'YOUR_DATAFORSEO_PASSWORD' | base64)"
curl -s -X POST "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_overview/live" \
  -H "Authorization: Basic $cred" \
  -H "Content-Type: application/json" \
  -d '[{"keywords":["test"],"location_code":2840,"language_code":"en"}]' | jq .
```

Run with: `bash test-dataforseo.sh`

---

## Step 10: Common Solutions

### Solution 1: Restart Backend Server
```bash
# Stop server (Ctrl+C)
# Start again
node server/mcp-api-server.js
```

### Solution 2: Clear Node Modules and Reinstall
```bash
rm -rf node_modules package-lock.json
npm install express cors axios
```

### Solution 3: Check Port Conflict
```bash
# Check if port 3001 is in use
netstat -ano | findstr :3001  # Windows
lsof -i :3001                 # Mac/Linux

# If port is in use, change PORT in server/mcp-api-server.js (line 263)
const PORT = process.env.PORT || 3002;  # Change to 3002
```

### Solution 4: Verify Environment
```bash
# Check Node.js version (should be 14+)
node --version

# Check if required packages are installed
npm list express cors axios
```

### Solution 5: Test with Minimal Request
```bash
# Test with absolute minimum
curl -X POST "http://localhost:3001/api/mcp/DataForSEO_dataforseo_labs_google_keyword_overview" \
  -H "Content-Type: application/json" \
  -d '{"keywords":["test"],"location_name":"United States","language_code":"en"}'
```

---

## Step 11: Working Node.js/Express Example

### Minimal working proxy endpoint:
```javascript
// server/mcp-api-server.js - Keyword Overview endpoint
app.post('/api/mcp/DataForSEO_dataforseo_labs_google_keyword_overview', async (req, res) => {
  try {
    const { keywords, location_name, language_code } = req.body;
    
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({
        error: 'keywords array is required',
        tool: 'DataForSEO_dataforseo_labs_google_keyword_overview'
      });
    }
    
    // Convert location_name to location_code
    const locationCode = LOCATION_MAP[location_name] || 2840;
    
    // ✅ CRITICAL: Use string language_code directly (NOT numeric)
    const langCode = language_code || 'en';
    
    // ✅ CRITICAL: Must be array of task objects
    const requestBody = [{
      keywords: keywords,
      location_code: locationCode,
      language_code: langCode,  // String "en", not numeric 1000
    }];
    
    console.log('[DataForSEO] Request body:', JSON.stringify(requestBody, null, 2));
    
    // ✅ CRITICAL: Generate Base64 auth with NO spaces
    const auth = Buffer.from(`${DATAFORSEO_CREDENTIALS.api_login}:${DATAFORSEO_CREDENTIALS.api_password}`).toString('base64');
    
    const response = await axios.post(
      'https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_overview/live',
      requestBody,  // Array, not object
      {
        headers: {
          'Authorization': `Basic ${auth}`,  // Continuous Base64, no spaces
          'Content-Type': 'application/json',
        },
        timeout: 30000
      }
    );
    
    // Log full response for debugging
    console.log('[DataForSEO] Response Status:', response.status);
    console.log('[DataForSEO] API Status:', response.data.status_code, response.data.status_message);
    
    // Check for DataForSEO API errors
    if (response.data.tasks && response.data.tasks[0]) {
      const task = response.data.tasks[0];
      if (task.status_code !== 20000) {
        const errorMsg = task.status_message || `DataForSEO API error: ${task.status_code}`;
        console.error('[DataForSEO] Task error:', errorMsg);
        return res.status(500).json({
          error: errorMsg,
          tool: 'DataForSEO_dataforseo_labs_google_keyword_overview',
          details: response.data
        });
      }
    }
    
    res.json(response.data);
  } catch (error) {
    console.error('[DataForSEO] Error:', error.message);
    console.error('[DataForSEO] Response:', error.response?.data);
    
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.status_message || 
                        error.response?.data?.message || 
                        error.message;
    
    res.status(statusCode).json({
      error: errorMessage,
      tool: 'DataForSEO_dataforseo_labs_google_keyword_overview',
      details: error.response?.data || null
    });
  }
});
```

### Key points in the example:
1. ✅ `language_code: language_code || 'en'` - Use string directly
2. ✅ `requestBody = [{...}]` - Must be array
3. ✅ `Buffer.from(...).toString('base64')` - Generates continuous Base64
4. ✅ `'Authorization': \`Basic ${auth}\`` - No spaces in header
5. ✅ Logs full request/response for debugging
6. ✅ Checks `task.status_code !== 20000` for API errors

---

## Step 12: Contact DataForSEO Support

### If issue persists, contact DataForSEO with:

**Subject:** 500 Error on keyword_overview endpoint

**Information to provide:**
- Account email: `YOUR_DATAFORSEO_LOGIN`
- Endpoint: `/v3/dataforseo_labs/google/keyword_overview/live`
- Request format: (paste exact JSON - verify it's array with `language_code: "en"`)
- Response received: (paste full error response including `status_code` and `status_message`)
- HTTP status code: (200, 400, 401, 500, etc.)
- Timestamp: (when error occurred)
- Test curl output: (from Step 4 - direct API test)
- Server logs: (outgoing request and full response from DataForSEO)

**If you see `status_code: 50001` or `50002` in response:**
- This indicates DataForSEO server-side issue
- Include the full response JSON in your support ticket
- Mention you've verified:
  - Authorization header is properly formatted (no spaces)
  - `language_code` is string `"en"` (not numeric)
  - Request body is JSON array format

**DataForSEO Support:**
- Email: support@dataforseo.com
- Dashboard: https://app.dataforseo.com/support
- Include this troubleshooting document

---

## Error Code Reference

### DataForSEO Status Codes:
- `20000` - Success
- `40001` - Invalid parameter
- `40101` - Unauthorized (bad credentials)
- `40201` - Insufficient credits
- `50001` - Internal server error (DataForSEO side)
- `50002` - Service temporarily unavailable

### HTTP Status Codes:
- `200` - Request successful
- `400` - Bad request (invalid format)
- `401` - Unauthorized (authentication failed)
- `500` - Internal server error (could be backend or DataForSEO)

---

## Quick Reference

### Backend Server Location:
```
server/mcp-api-server.js
```

### Credentials Location:
```javascript
// Line 17-20 in server/mcp-api-server.js
const DATAFORSEO_CREDENTIALS = {
  api_login: 'YOUR_DATAFORSEO_LOGIN',
  api_password: 'YOUR_DATAFORSEO_PASSWORD'
};
```

### Frontend Sends To Backend:
```json
{
  "keywords": ["keyword1", "keyword2"],
  "location_name": "United States",
  "language_code": "en"
}
```

### Backend Converts To (What Goes To DataForSEO):
```json
[{
  "keywords": ["keyword1", "keyword2"],
  "location_code": 2840,
  "language_code": "en"  // ✅ String, NOT 1000
}]
```

### Critical Code Checks:

**1. Language Code (Line ~97 in server/mcp-api-server.js):**
```javascript
// ✅ CORRECT
const langCode = language_code || 'en';

// ❌ WRONG
const langCode = LANGUAGE_MAP[language_code] || 1000;
```

**2. Authorization Header (Line ~57):**
```javascript
// ✅ CORRECT - auth is continuous Base64
headers: {
  'Authorization': `Basic ${auth}`,
}

// ❌ WRONG - spaces break auth
'Authorization': `Basic ${auth} `,  // Trailing space
```

**3. Request Body (Line ~101):**
```javascript
// ✅ CORRECT - Array of task objects
const data = [{
  keywords: keywords,
  location_code: locationCode,
  language_code: langCode,
}];

// ❌ WRONG - Plain object
const data = {
  keywords: keywords,
  location_code: locationCode,
  language_code: langCode,
};
```

---

## Next Steps (Priority Order)

1. ✅ **CRITICAL:** Verify Step 6 - Authorization header has NO spaces
2. ✅ **CRITICAL:** Verify Step 5 - `language_code` is string `"en"` (not `1000`)
3. ✅ **CRITICAL:** Verify Step 5 - Request body is array `[{...}]` (not `{...}`)
4. ✅ Run Step 1: Verify server is running
5. ✅ Run Step 2: Test backend endpoint directly
6. ✅ Check Step 3: Review server logs (look for outgoing request format)
7. ✅ Run Step 4: Test DataForSEO API directly (bypass backend)
8. ✅ Review Step 7: Check frontend communication
9. ✅ Validate Step 8: Verify code changes match Step 11 example
10. ✅ Collect Step 9: Debug information
11. ✅ Try Step 10: Common solutions
12. ✅ If still failing: Contact DataForSEO support (Step 12)

## Official DataForSEO Documentation Links

- **Keyword Overview (Labs):** https://docs.dataforseo.com/v3/dataforseo_labs/google/keyword_overview/live/?bash
- **Search Intent (Labs):** https://docs.dataforseo.com/v3/dataforseo_labs/search_intent/live/?bash
- **Authentication:** https://docs.dataforseo.com/v3/auth/?bash
- **Locations & Languages:** https://docs.dataforseo.com/v3/dataforseo_labs/locations_and_languages/?bash

---

**Last Updated:** December 2024  
**Version:** 1.0


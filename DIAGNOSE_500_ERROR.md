# Diagnosing the 500 Error - Step by Step

## Issue
Getting `Failed to get keyword overview: MCP API error (500):`

## Root Cause Analysis

### Potential Issues Found:

1. **Frontend API Base URL** ✅ FIXED
   - **Problem:** Frontend was defaulting to `/api/mcp` (relative URL) instead of `http://localhost:3001/api/mcp`
   - **Fix:** Updated to default to `http://localhost:3001/api/mcp` in development mode
   - **File:** `src/lib/mcp-tools.ts` line 10

2. **Error Response Parsing** ✅ IMPROVED
   - **Problem:** Error messages weren't being parsed from JSON responses
   - **Fix:** Added JSON parsing for error responses to show better error messages
   - **File:** `src/lib/mcp-tools.ts` lines 22-35

3. **Backend Error Handling** ✅ IMPROVED
   - **Problem:** Error responses weren't providing enough detail
   - **Fix:** Enhanced error logging and response format
   - **File:** `server/mcp-api-server.js` lines 211-240

## How to Diagnose the 500 Error

### Step 1: Check if Backend Server is Running
```bash
curl http://localhost:3001/api/mcp/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "message": "MCP API server is running",
  "credentials": {
    "api_login": "YOUR_DATAFORSEO_LOGIN",
    "configured": true,
    "auth_encoding_valid": true
  }
}
```

**If this fails:**
- Backend server is not running
- Start it with: `node server/mcp-api-server.js`

### Step 2: Check Browser Console
Open browser DevTools (F12) and look for:
- `[MCP] Calling: http://localhost:3001/api/mcp/DataForSEO_dataforseo_labs_google_keyword_overview`
- Any CORS errors
- Network errors

### Step 3: Check Backend Server Logs
When you make a request, the backend should log:
```
[DataForSEO] Calling API: /dataforseo_labs/google/keyword_overview/live
[DataForSEO] Request body: [{"keywords":["test"],"location_code":2840,"language_code":"en"}]
[DataForSEO] Outgoing headers: {...}
```

**If you see errors:**
- `ECONNREFUSED` → Can't connect to DataForSEO API (network/firewall issue)
- `ETIMEDOUT` → Request timed out (network issue)
- `401` → Authentication failed (check credentials)
- `400` → Bad request (check request format)
- `50001` or `50002` → DataForSEO internal error

### Step 4: Test Backend Endpoint Directly
```bash
curl -X POST "http://localhost:3001/api/mcp/DataForSEO_dataforseo_labs_google_keyword_overview" \
  -H "Content-Type: application/json" \
  -d '{"keywords":["test"],"location_name":"United States","language_code":"en"}'
```

**Check the response:**
- If 500: Check backend console logs for the exact error
- If 200: Backend is working, issue is in frontend
- If connection refused: Backend not running

### Step 5: Test DataForSEO API Directly
```bash
cred="$(printf '%s:%s' 'YOUR_DATAFORSEO_LOGIN' 'YOUR_DATAFORSEO_PASSWORD' | base64)"
curl -X POST "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_overview/live" \
  -H "Authorization: Basic $cred" \
  -H "Content-Type: application/json" \
  -d '[{"keywords":["test"],"location_code":2840,"language_code":"en"}]'
```

**If this works:** Credentials and network are fine, issue is in backend code
**If this fails:** Check credentials or DataForSEO API status

## Common 500 Error Causes

### 1. Backend Server Not Running
**Symptom:** Connection refused error
**Fix:** Start backend with `node server/mcp-api-server.js`

### 2. Wrong API Base URL
**Symptom:** 404 or connection refused from frontend
**Fix:** Check `VITE_MCP_API_BASE` env variable or use default `http://localhost:3001/api/mcp`

### 3. DataForSEO API Error
**Symptom:** Backend logs show DataForSEO API error
**Check:** Look for `[DataForSEO] API Error Details:` in backend logs
**Fix:** See error details in logs, may need to retry or contact DataForSEO support

### 4. Request Format Error
**Symptom:** Backend throws validation error
**Check:** Backend logs will show "must be" error messages
**Fix:** Verify request format matches requirements

### 5. Network/Firewall Issue
**Symptom:** `ECONNREFUSED` or `ETIMEDOUT` errors
**Fix:** Check firewall settings, verify can reach `api.dataforseo.com`

## What to Check in Backend Logs

When you get a 500 error, look for these log messages:

```
[DataForSEO] Calling API: /dataforseo_labs/google/keyword_overview/live
[DataForSEO] Request body: [...]
[DataForSEO] Outgoing headers: {...}
[DataForSEO] Response Status: 200
[DataForSEO] API Status: 20000 - Ok.
```

**OR if there's an error:**

```
[DataForSEO] API Error Details: {
  "httpStatus": 500,
  "apiStatusCode": 50001,
  "apiStatusMessage": "...",
  ...
}
```

## Next Steps

1. **Start the backend server:**
   ```bash
   node server/mcp-api-server.js
   ```

2. **Test the health endpoint:**
   ```bash
   curl http://localhost:3001/api/mcp/health
   ```

3. **Make a request from the frontend and check:**
   - Browser console for `[MCP] Calling:` messages
   - Backend console for `[DataForSEO]` messages
   - Network tab in DevTools for the actual request/response

4. **If still getting 500:**
   - Copy the full error from backend logs
   - Copy the full error from browser console
   - Check if DataForSEO API is accessible directly

## Quick Fix Checklist

- [ ] Backend server is running (`node server/mcp-api-server.js`)
- [ ] Health endpoint returns `{"status":"ok"}`
- [ ] Frontend is calling `http://localhost:3001/api/mcp/...` (check browser console)
- [ ] Backend logs show `[DataForSEO]` messages
- [ ] No CORS errors in browser console
- [ ] Direct DataForSEO API test works (Step 5 above)


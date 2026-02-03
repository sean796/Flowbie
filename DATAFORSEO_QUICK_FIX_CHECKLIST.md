# DataForSEO 500 Error - Quick Fix Checklist

**Use this checklist to quickly identify and fix the 500 error.**

---

## ✅ CRITICAL FIXES (Do These First)

### Fix 1: Authorization Header - NO SPACES
**Location:** `server/mcp-api-server.js` line 25 & 57

**Check:**
```javascript
// Line 25 - Should generate continuous Base64
const auth = Buffer.from(`${DATAFORSEO_CREDENTIALS.api_login}:${DATAFORSEO_CREDENTIALS.api_password}`).toString('base64');
// Result: c2VhbkBvZGlud2ViM2xhYnMuY29tOmZjMTU0ZjMzOTdiOGM2ZDI= (NO SPACES)

// Line 57 - Should use auth directly
'Authorization': `Basic ${auth}`,  // NO trailing spaces
```

**Test:**
```bash
node -e "console.log(Buffer.from('YOUR_DATAFORSEO_LOGIN:YOUR_DATAFORSEO_PASSWORD').toString('base64'))"
# Should output: c2VhbkBvZGlud2ViM2xhYnMuY29tOmZjMTU0ZjMzOTdiOGM2ZDI=
# Verify NO spaces in output
```

---

### Fix 2: Language Code - Use STRING "en" (NOT numeric 1000)
**Location:** `server/mcp-api-server.js` lines 135, 193, 234, 274

**Check each Labs endpoint:**
```javascript
// ✅ CORRECT (for Labs endpoints)
const langCode = language_code || 'en';

// ❌ WRONG
const langCode = LANGUAGE_MAP[language_code] || 1000;
```

**Endpoints to check:**
- ✅ Line 135: `keyword_overview` - Should use `language_code || 'en'`
- ✅ Line 193: `keyword_ideas` - Should use `language_code || 'en'`
- ✅ Line 234: `related_keywords` - Should use `language_code || 'en'`
- ✅ Line 274: `search_intent` - Should use `language_code || 'en'`
- ⚠️ Line 312: `serp_organic` - May use numeric (not a Labs endpoint)

---

### Fix 3: Request Body - Must Be ARRAY
**Location:** `server/mcp-api-server.js` lines 137, 195, 236, 276

**Check:**
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

## 🧪 Quick Test Commands

### 1. Test Backend Health
```bash
curl http://localhost:3001/api/mcp/health
```

### 2. Test Backend Endpoint
```bash
curl -X POST "http://localhost:3001/api/mcp/DataForSEO_dataforseo_labs_google_keyword_overview" \
  -H "Content-Type: application/json" \
  -d '{"keywords":["test"],"location_name":"United States","language_code":"en"}'
```

### 3. Test DataForSEO API Directly
```bash
cred="$(printf '%s:%s' 'YOUR_DATAFORSEO_LOGIN' 'YOUR_DATAFORSEO_PASSWORD' | base64)"
curl -X POST "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_overview/live" \
  -H "Authorization: Basic $cred" \
  -H "Content-Type: application/json" \
  -d '[{"keywords":["test"],"location_code":2840,"language_code":"en"}]'
```

---

## 📋 Verification Checklist

Run through this checklist:

- [ ] Backend server is running (`node server/mcp-api-server.js`)
- [ ] Health endpoint returns `{"status":"ok"}`
- [ ] Authorization Base64 has NO spaces (test with node command above)
- [ ] All Labs endpoints use `language_code || 'en'` (string, not numeric)
- [ ] Request body is array `[{...}]` not object `{...}`
- [ ] Server logs show `[DataForSEO]` prefixed messages
- [ ] Direct DataForSEO API test succeeds (Step 3 above)

---

## 🔍 What to Check in Server Logs

When you make a request, look for:

**Good logs:**
```
[DataForSEO] Calling API: /dataforseo_labs/google/keyword_overview/live
[DataForSEO] Request body: [{"keywords":["test"],"location_code":2840,"language_code":"en"}]
[DataForSEO] Response Status: 200
[DataForSEO] API Status: 20000 - Ok.
```

**Error logs:**
```
[DataForSEO] API Error Details: {...}
[DataForSEO] API Status: 40101 - Unauthorized  // Check auth header
[DataForSEO] API Status: 40001 - Invalid parameter  // Check language_code format
[DataForSEO] API Status: 50001 - Internal server error  // DataForSEO issue
```

---

## 🚨 Common Error Patterns

### Error: 401 Unauthorized
**Cause:** Authorization header has spaces or credentials wrong
**Fix:** Verify Base64 encoding has no spaces (Fix 1)

### Error: 400 Bad Request
**Cause:** `language_code` is numeric `1000` instead of string `"en"`
**Fix:** Use string language codes (Fix 2)

### Error: 500 Internal Server Error
**Cause:** Could be:
1. Request format wrong (not array, wrong language_code type)
2. DataForSEO server issue
**Fix:** 
- First verify Fixes 1-3 above
- If still 500, check response JSON for `status_code: 50001` (DataForSEO issue)
- Retry after 30 seconds
- Contact DataForSEO support if persistent

---

## 📞 If Still Failing

1. Run diagnostic script: `node test-dataforseo.js`
2. Check full troubleshooting guide: `DATAFORSEO_500_ERROR_TROUBLESHOOTING.md`
3. Collect debug info:
   - Server logs (full output)
   - Test curl outputs (all 3 tests above)
   - Browser console errors
4. Contact DataForSEO support with:
   - Account: `YOUR_DATAFORSEO_LOGIN`
   - Full request/response from server logs
   - Test curl outputs

---

**Last Updated:** December 2024


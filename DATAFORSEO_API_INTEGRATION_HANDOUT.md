# DataForSEO API Integration - Technical Handout

**Purpose:** This document describes how our application integrates with DataForSEO API for keyword research functionality. Use this when contacting DataForSEO support.

---

## Architecture Overview

```
Frontend (React/TypeScript)
    ↓ HTTP POST
Backend Proxy Server (Express.js on localhost:3001)
    ↓ HTTPS POST with Basic Auth
DataForSEO REST API (https://api.dataforseo.com/v3)
```

---

## Authentication

**Method:** HTTP Basic Authentication  
**Credentials:**
- API Login: `YOUR_DATAFORSEO_LOGIN`
- API Password: `YOUR_DATAFORSEO_PASSWORD`
- Encoded: Base64(`YOUR_DATAFORSEO_LOGIN:YOUR_DATAFORSEO_PASSWORD`)

**Header:**
```
Authorization: Basic c2VhbkBvZGlud2ViM2xhYnMuY29tOmZjMTU0ZjMzOTdiOGM2ZDI=
Content-Type: application/json
```

**Note:** The Base64 token must be continuous with no spaces or newlines. Generated using: `Buffer.from('login:password').toString('base64')`

---

## API Endpoints We're Using

### 1. Keyword Overview
**Our Endpoint:** `POST /api/mcp/DataForSEO_dataforseo_labs_google_keyword_overview`  
**DataForSEO Endpoint:** `POST https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_overview/live`

**Request Body (sent to DataForSEO):**
```json
[
  {
    "keywords": ["best seo tools"],
    "location_code": 2840,
    "language_code": "en"
  }
]
```

**Note:** DataForSEO Labs endpoints require `language_code` as a string (e.g., `"en"`), not numeric codes.

**Expected Response Structure:**
```json
{
  "version": "0.1.20231218",
  "status_code": 20000,
  "status_message": "Ok.",
  "time": "0.1234",
  "cost": 0.001,
  "tasks_count": 1,
  "tasks_error": 0,
  "tasks": [
    {
      "id": "1234567890",
      "status_code": 20000,
      "status_message": "Ok.",
      "time": "0.1234",
      "cost": 0.001,
      "result_count": 1,
      "path": [
        "v3",
        "dataforseo_labs",
        "google",
        "keyword_overview",
        "live"
      ],
      "data": {
        "api": "dataforseo_labs",
        "function": "keyword_overview",
        "keywords": ["best seo tools"],
        "location_code": 2840,
        "language_code": "en"
      },
      "result": [
        {
          "keyword": "best seo tools",
          "keyword_info": {
            "keyword": "best seo tools",
            "search_volume": 12100,
            "competition": 0.75,
            "competition_level": "HIGH",
            "cpc": 2.45,
            "monthly_searches": [
              {
                "year": 2024,
                "month": 12,
                "search_volume": 12100
              }
            ],
            "keyword_difficulty": 65
          }
        }
      ]
    }
  ]
}
```

**What We Extract:**
- `keyword_info.keyword` → `keyword`
- `keyword_info.keyword_difficulty` → `difficulty`
- `keyword_info.search_volume` → `searchVolume`
- `keyword_info.cpc` → `cpc`
- `keyword_info.competition_level` → `competition` (mapped to LOW/MEDIUM/HIGH)

---

### 2. Keyword Ideas (Semantic Keywords)
**Our Endpoint:** `POST /api/mcp/DataForSEO_dataforseo_labs_google_keyword_ideas`  
**DataForSEO Endpoint:** `POST https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_ideas/live`

**Request Body:**
```json
[
  {
    "keywords": ["best seo tools"],
    "location_code": 2840,
    "language_code": "en",
    "limit": 20
  }
]
```

**Expected Response:**
Similar structure to keyword overview, but with `keyword_data` array containing related keyword suggestions.

---

### 3. Search Intent Classification
**Our Endpoint:** `POST /api/mcp/DataForSEO_dataforseo_labs_search_intent`  
**DataForSEO Endpoint:** `POST https://api.dataforseo.com/v3/dataforseo_labs/search_intent/live`

**Request Body:**
```json
[
  {
    "keyword": "best seo tools",
    "language_code": "en"
  }
]
```

**Expected Response:**
```json
{
  "tasks": [
    {
      "result": [
        {
          "keyword": "best seo tools",
          "keyword_intent": {
            "label": "commercial",
            "probability": 0.85
          },
          "secondary_keyword_intents": [
            {
              "label": "informational",
              "probability": 0.12
            }
          ]
        }
      ]
    }
  ]
}
```

**Note:** The API returns `keyword_intent.label` and `keyword_intent.probability`, not `search_intent.intent`. The `secondary_keyword_intents` array contains alternative intent classifications.

**Intent Mapping:**
- `"informational"` → informational
- `"commercial"` → commercial
- `"transactional"` → transactional
- `"navigational"` → navigational

---

### 4. SERP Organic Live Advanced (Competitor Analysis)
**Our Endpoint:** `POST /api/mcp/DataForSEO_serp_organic_live_advanced`  
**DataForSEO Endpoint:** `POST https://api.dataforseo.com/v3/serp/google/organic/live/advanced`

**Request Body:**
```json
[
  {
    "keyword": "best seo tools",
    "location_code": 2840,
    "language_code": "en",
    "depth": 10,
    "device": "desktop"
  }
]
```

**Note:** SERP endpoints may accept both string and numeric language codes. Check DataForSEO documentation for the specific endpoint.

**Expected Response:**
```json
{
  "tasks": [
    {
      "result": [
        {
          "keyword": "best seo tools",
          "type": "organic",
          "se_results_count": 1000000000,
          "items_count": 10,
          "items": [
            {
              "type": "organic",
              "rank_group": 1,
              "rank_absolute": 1,
              "position": "1",
              "xpath": "/html[1]/body[1]/div[1]/div[3]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]",
              "title": "10 Best SEO Tools in 2024",
              "url": "https://example.com/best-seo-tools",
              "breadcrumb": "example.com > SEO Tools",
              "description": "Discover the best SEO tools...",
              "domain": "example.com"
            }
          ]
        }
      ]
    }
  ]
}
```

---

## Location & Language Code Mappings

### Location Codes
```javascript
{
  "United States": 2840,
  "United Kingdom": 2826,
  "Canada": 2124,
  "Australia": 2036
}
```

### Language Codes
```javascript
{
  "en": "en",  // English
  "es": "es",  // Spanish
  "fr": "fr",  // French
  "de": "de"   // German
}
```

**Important:** DataForSEO Labs endpoints (`keyword_overview`, `keyword_ideas`, `search_intent`, `related_keywords`) require `language_code` as a string (e.g., `"en"`), not numeric codes. SERP endpoints may accept numeric codes - verify with DataForSEO documentation.

---

## Error Handling

### Our Error Response Format
```json
{
  "error": "Error message from DataForSEO API",
  "tool": "DataForSEO_dataforseo_labs_google_keyword_overview",
  "details": {
    // Full DataForSEO API error response
  }
}
```

### Common Error Scenarios

1. **404 Not Found**
   - **Cause:** Backend server not running or endpoint path incorrect
   - **Our Action:** Check server logs, verify endpoint exists

2. **500 Internal Server Error**
   - **Cause:** DataForSEO API returned error, or our backend processing failed
   - **Our Action:** Log full error details, check DataForSEO API response

3. **401 Unauthorized**
   - **Cause:** Invalid credentials or expired API key
   - **Our Action:** Verify credentials are correct

4. **400 Bad Request**
   - **Cause:** Invalid request parameters (e.g., wrong location_code format)
   - **Our Action:** Validate parameters before sending

5. **Status Code != 20000 in Response**
   - **Cause:** DataForSEO API returned error status
   - **Our Action:** Extract `status_message` and display to user

---

## Request Flow Example

### Step 1: User Action
User enters keyword "best seo tools" and clicks "Analyze"

### Step 2: Frontend Call
```javascript
// Frontend calls our backend
POST http://localhost:3001/api/mcp/DataForSEO_dataforseo_labs_google_keyword_overview
Body: {
  "keywords": ["best seo tools"],
  "location_name": "United States",
  "language_code": "en"
}
```

### Step 3: Backend Processing
```javascript
// Backend converts parameters
location_name: "United States" → location_code: 2840
language_code: "en" → language_code: "en" (keep as string for Labs endpoints)

// Backend calls DataForSEO
POST https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_overview/live
Headers: {
  "Authorization": "Basic c2VhbkBvZGlud2ViM2xhYnMuY29tOmZjMTU0ZjMzOTdiOGM2ZDI=",
  "Content-Type": "application/json"
}
Body: [{
  "keywords": ["best seo tools"],
  "location_code": 2840,
  "language_code": "en"
}]
```

### Step 4: Response Processing
```javascript
// Backend receives DataForSEO response
// Validates status_code === 20000
// Extracts keyword_info from result
// Returns to frontend
```

### Step 5: Frontend Display
Frontend receives keyword data and displays:
- Keyword difficulty
- Search volume
- CPC
- Competition level
- Search intent

---

## Current Issues & Questions for DataForSEO Support

### Issue 1: 500 Error on Keyword Overview
**Symptom:** Backend receives 500 error when calling `/dataforseo_labs/google/keyword_overview/live`

**Request Being Sent:**
```json
[
  {
    "keywords": ["test keyword"],
    "location_code": 2840,
    "language_code": "en"
  }
]
```

**Questions:**
1. Is the request format correct?
2. Are `location_code` and `language_code` valid?
3. Is the endpoint path correct: `/v3/dataforseo_labs/google/keyword_overview/live`?
4. Are there any account limitations or rate limits we're hitting?

### Issue 2: Empty Results
**Symptom:** API returns 20000 status but `result` array is empty or missing `keyword_info`

**Questions:**
1. Is this expected for certain keywords?
2. Should we check `status_message` for warnings?
3. Are there minimum requirements for keyword data to be returned?

### Issue 3: Search Intent Classification
**Symptom:** Search intent endpoint returns different structure than expected

**Questions:**
1. What is the exact response structure for `/dataforseo_labs/search_intent/live`?
2. Are there any prerequisites for this endpoint?
3. What languages are supported?

---

## Testing & Debugging

### Test Request (cURL)
```bash
# Generate Base64 auth (replace with your credentials)
cred="$(printf '%s:%s' 'YOUR_DATAFORSEO_LOGIN' 'YOUR_DATAFORSEO_PASSWORD' | base64)"

# Test keyword overview endpoint
curl -X POST "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_overview/live" \
  -H "Authorization: Basic $cred" \
  -H "Content-Type: application/json" \
  -d '[{
    "keywords": ["best seo tools"],
    "location_code": 2840,
    "language_code": "en"
  }]'
```

**Note:** The Base64 token must be continuous with no spaces. Use the `cred` variable as shown above to ensure proper encoding.

### Backend Logs
Our backend logs:
- Full request being sent to DataForSEO
- Full response received from DataForSEO
- Any errors with status codes and messages

### Frontend Console
Frontend logs:
- API call attempts
- Response status
- Error messages
- Cache hits/misses

---

## Account Information

**API Login:** `YOUR_DATAFORSEO_LOGIN`  
**Account Type:** (Please confirm with DataForSEO)  
**Rate Limits:** (Please confirm with DataForSEO)  
**Available Endpoints:** (Please confirm which endpoints are available for this account)

---

## Support Checklist

When contacting DataForSEO support, please provide:

- [ ] This handout document
- [ ] Exact error message from backend logs
- [ ] Full request body being sent
- [ ] Full response body received (if any)
- [ ] Account email: `YOUR_DATAFORSEO_LOGIN`
- [ ] Endpoint being called
- [ ] Timestamp of the error
- [ ] Whether this is a new integration or existing one

---

## Contact Information

**Our Application:** Agent Blueprint Builder  
**Integration Type:** REST API via Express.js proxy server  
**Date:** December 2024  
**Status:** In Development / Testing

---

## Additional Notes

1. **Caching:** We implement client-side caching (24-hour expiry) to reduce API calls
2. **Fallback:** If DataForSEO API fails, we use heuristic-based classification for search intent
3. **Validation:** We validate all responses before displaying to users
4. **Error Recovery:** We show user-friendly error messages and allow retry

---

**Last Updated:** December 2024  
**Version:** 1.0


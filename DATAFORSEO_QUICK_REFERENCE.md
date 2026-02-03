# DataForSEO API - Quick Reference

## Quick Test (cURL)

```bash
curl -X POST "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_overview/live" \
  -H "Authorization: Basic c2VhbkBvZGlu d2ViM2xhYnMuY29tOmZjMTU0ZjMzOTdiOGM2ZDI=" \
  -H "Content-Type: application/json" \
  -d '[{"keywords": ["test"], "location_code": 2840, "language_code": 1000}]'
```

## Endpoints We Call

| Our Endpoint | DataForSEO Endpoint | Purpose |
|-------------|-------------------|---------|
| `/api/mcp/DataForSEO_dataforseo_labs_google_keyword_overview` | `/v3/dataforseo_labs/google/keyword_overview/live` | Get keyword difficulty, volume, CPC |
| `/api/mcp/DataForSEO_dataforseo_labs_google_keyword_ideas` | `/v3/dataforseo_labs/google/keyword_ideas/live` | Get semantic keyword suggestions |
| `/api/mcp/DataForSEO_dataforseo_labs_search_intent` | `/v3/dataforseo_labs/search_intent/live` | Classify search intent |
| `/api/mcp/DataForSEO_serp_organic_live_advanced` | `/v3/serp/google/organic/live/advanced` | Get competitor SERP data |

## Request Format

```json
[
  {
    "keywords": ["keyword here"],
    "location_code": 2840,  // United States
    "language_code": 1000   // English
  }
]
```

## Expected Response

```json
{
  "status_code": 20000,
  "status_message": "Ok.",
  "tasks": [{
    "status_code": 20000,
    "result": [{
      "keyword": "...",
      "keyword_info": {
        "keyword_difficulty": 65,
        "search_volume": 12100,
        "cpc": 2.45,
        "competition_level": "HIGH"
      }
    }]
  }]
}
```

## Common Codes

**Location:**
- United States: `2840`
- United Kingdom: `2826`
- Canada: `2124`

**Language:**
- English: `1000`
- Spanish: `1014`
- French: `1015`

## Error Codes

- `20000` = Success
- `40000+` = Client error
- `50000+` = Server error

## Account

- **Email:** `YOUR_DATAFORSEO_LOGIN`
- **Auth:** Basic (login:password base64 encoded)

## When Contacting Support

1. Share the full error response from DataForSEO
2. Include the exact request body we sent
3. Mention account: `YOUR_DATAFORSEO_LOGIN`
4. Specify which endpoint failed


# Backend API Setup for Keyword Research

The keyword research features require backend API endpoints that call DataForSEO MCP tools. This document explains how to set up these endpoints.

## MCP Server Configuration

First, configure your MCP server with DataForSEO credentials:
- **API Login**: Set in env as `DATAFORSEO_API_LOGIN`
- **API Password**: Set in env as `DATAFORSEO_API_PASSWORD`

## Google Search Console (GSC)

For GSC integration (keyword research, sitemaps), set the env var:
- **GSC_SERVICE_ACCOUNT_JSON**: Full JSON key string from your Google Cloud service account. Never commit this value. Get it from [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts) → create key → copy the JSON and paste as one line into your `.env` or environment.

## Required Backend API Endpoints

The frontend expects MCP tools to be accessible via `/api/mcp/{toolName}` endpoints.

### 1. `/api/mcp/DataForSEO_dataforseo_labs_google_keyword_overview` (POST)
Calls `mcp_DataForSEO_dataforseo_labs_google_keyword_overview`

**Request Body:**
```json
{
  "keywords": ["keyword1", "keyword2"],
  "location_code": 2840,
  "language_code": 1000
}
```

**Response:**
```json
{
  "tasks": [
    {
      "result": [
        {
          "keyword": "keyword1",
          "keyword_info": {
            "keyword": "keyword1",
            "search_volume": 10000,
            "cpc": 1.5,
            "competition_level": "MEDIUM",
            "keyword_difficulty": 45
          }
        }
      ]
    }
  ]
}
```

### 2. `/api/mcp/DataForSEO_dataforseo_labs_google_keyword_ideas` (POST)
Calls `mcp_DataForSEO_dataforseo_labs_google_keyword_ideas`

### 3. `/api/mcp/DataForSEO_dataforseo_labs_google_related_keywords` (POST)
Calls `mcp_DataForSEO_dataforseo_labs_google_related_keywords`

**Request Body:**
```json
{
  "keyword": "seed keyword",
  "location_code": 2840,
  "language_code": 1000,
  "limit": 20
}
```

### 4. `/api/mcp/DataForSEO_dataforseo_labs_search_intent` (POST)
Calls `mcp_DataForSEO_dataforseo_labs_search_intent`

**Request Body:**
```json
{
  "keywords": ["keyword1", "keyword2"],
  "language_code": 1000
}
```

### 5. `/api/mcp/DataForSEO_serp_organic_live_advanced` (POST)
Calls `mcp_DataForSEO_serp_organic_live_advanced`

**Request Body:**
```json
{
  "keyword": "target keyword",
  "location_code": 2840,
  "language_code": 1000,
  "depth": 10
}
```

## Example Backend Implementation (Node.js/Express)

```javascript
const express = require('express');
const router = express.Router();

// MCP client setup (example - adjust based on your MCP client library)
const { MCPClient } = require('@modelcontextprotocol/sdk');

const mcpClient = new MCPClient({
  // Configure with DataForSEO credentials
  api_login: process.env.DATAFORSEO_API_LOGIN,
  api_password: process.env.DATAFORSEO_API_PASSWORD,
});

// Generic MCP tool endpoint
router.post('/mcp/:toolName', async (req, res) => {
  try {
    const { toolName } = req.params;
    const params = req.body;
    
    // Call MCP tool
    const result = await mcpClient.callTool(toolName, params);
    
    res.json(result);
  } catch (error) {
    console.error(`MCP tool ${req.params.toolName} error:`, error);
    res.status(500).json({ 
      error: error.message,
      tool: req.params.toolName 
    });
  }
});

// Specific endpoint example for keyword overview
router.post('/mcp/DataForSEO_dataforseo_labs_google_keyword_overview', async (req, res) => {
  try {
    const { keywords, location_name, language_code } = req.body;
    
    const result = await mcpClient.callTool(
      'mcp_DataForSEO_dataforseo_labs_google_keyword_overview',
      {
        keywords,
        location_name,
        language_code,
      }
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Similar implementations for other MCP tools...
```

## Database Integration

The frontend automatically saves keyword research data to localStorage (see `src/lib/keyword-db.ts`). For production, you may want to:

1. Save keyword data to your backend database
2. Sync localStorage with backend on app load
3. Implement user authentication to associate keyword research with users

## MCP Server Configuration

Ensure your MCP server is configured with DataForSEO credentials:
- DataForSEO API username
- DataForSEO API password

These should be stored securely in your backend environment variables.


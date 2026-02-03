# How to Start the Backend Server

## Quick Start

### Option 1: Direct Node.js (Recommended)
```bash
# From project root directory
node server/mcp-api-server.js
```

### Option 2: Using npm (if in server directory)
```bash
cd server
npm install  # Only needed first time
node mcp-api-server.js
```

### Option 3: Using npm start script
```bash
cd server
npm install  # Only needed first time
npm start
```

## Expected Output

When the server starts successfully, you should see:
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

## Verify Server is Running

Open a new terminal and run:
```bash
curl http://localhost:3001/api/mcp/health
```

Or visit in browser: http://localhost:3001/api/mcp/health

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

## Troubleshooting

### Error: Cannot find module 'express'
**Solution:** Install dependencies
```bash
cd server
npm install
```

### Error: Port 3001 already in use
**Solution:** Either:
1. Stop the process using port 3001
2. Change the port in `server/mcp-api-server.js` (line 359): `const PORT = process.env.PORT || 3002;`
3. Update frontend to use new port: Set `VITE_MCP_API_BASE=http://localhost:3002/api/mcp` in `.env`

### Error: EADDRINUSE
**Solution:** Another process is using port 3001. Find and stop it:
```bash
# Windows PowerShell
netstat -ano | findstr :3001
# Then kill the process ID shown

# Or change the port (see above)
```

## Keep Server Running

The server must stay running while you use the frontend. Keep the terminal window open.

To run in background (Windows):
```powershell
Start-Process node -ArgumentList "server\mcp-api-server.js" -WindowStyle Hidden
```

## Next Steps

Once the server is running:
1. Verify health endpoint works (see above)
2. Try using the keyword research feature in the frontend
3. Check browser console for `[MCP] Calling: http://localhost:3001/api/mcp/...` messages
4. Check backend console for `[DataForSEO]` log messages


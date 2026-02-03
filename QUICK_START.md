# Quick Start Guide - Keyword Research

## Step 1: Start the Backend Server

Open a **new terminal window** and run:

```bash
cd server
npm install
npm start
```

You should see:
```
✅ MCP API server running on http://localhost:3001
📊 DataForSEO credentials configured for: YOUR_DATAFORSEO_LOGIN
```

**Keep this terminal open** - the server must stay running.

## Step 2: Start the Frontend (if not already running)

In your main project terminal:

```bash
npm run dev
```

## Step 3: Test the Connection

1. Open the app in your browser
2. Go to **Manager Panel** → **Keyword Research** tab
3. Enter a keyword (e.g., "best seo tools")
4. Check "Force fresh data (bypass cache)"
5. Click **Analyze (Fresh)**

## Troubleshooting

### If you see "404" or "Connection Refused":
- Make sure the backend server is running on port 3001
- Check the server terminal for errors

### If you see "500" error:
- Check the server console for the specific DataForSEO API error
- Verify your DataForSEO credentials are correct

### If nothing happens:
- Check the browser console (F12) for JavaScript errors
- Check the server terminal for API errors
- Make sure both servers are running

## Server Status Check

Visit: http://localhost:3001/api/mcp/health

You should see: `{"status":"ok","message":"MCP API server is running"}`


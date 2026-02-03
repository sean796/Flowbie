# Start Backend Server Always Running

The backend server needs to be running for the Keyword Research tool to work. Here's how to keep it running automatically.

## Quick Start (Recommended - PM2)

PM2 keeps the server running in the background and auto-restarts if it crashes.

### First Time Setup:

1. **Install PM2 globally:**
   ```powershell
   npm install -g pm2
   ```

2. **Start the server with PM2:**
   ```powershell
   .\start-backend-pm2.ps1
   ```

That's it! The server will now run in the background.

### Useful PM2 Commands:

```powershell
# Check if server is running
pm2 status

# View server logs
pm2 logs mcp-api-server

# Restart the server
pm2 restart mcp-api-server

# Stop the server
pm2 stop mcp-api-server

# Remove from PM2 (stops and removes)
pm2 delete mcp-api-server
```

### Stop the Server:

```powershell
.\stop-backend-pm2.ps1
```

Or manually:
```powershell
pm2 stop mcp-api-server
```

## Alternative: Manual Start (Not Recommended)

If you don't want to use PM2, you can start the server manually, but it will stop when you close the terminal:

```powershell
.\start-backend.ps1
```

**Note:** The server will stop when you close the terminal window. Use PM2 for always-on operation.

## Verify Server is Running

Visit: http://localhost:3001/api/mcp/health

You should see:
```json
{
  "status": "ok",
  "message": "MCP API server is running"
}
```

## Auto-Start on Windows Boot (Optional)

To make the server start automatically when Windows boots:

1. **Save PM2 process list:**
   ```powershell
   pm2 save
   ```

2. **Setup PM2 startup script:**
   ```powershell
   pm2 startup
   ```
   
   This will give you a command to run as Administrator. Copy and run that command.

3. **The server will now start automatically on boot!**

## Troubleshooting

### Port 3001 Already in Use
If you get an error that port 3001 is already in use:

1. Check what's using it:
   ```powershell
   netstat -ano | findstr :3001
   ```

2. Stop the existing process or change the port in `server/mcp-api-server.js` (line 492)

### PM2 Not Found
If PM2 is not recognized:
```powershell
npm install -g pm2
```

### Server Keeps Crashing
Check the logs:
```powershell
pm2 logs mcp-api-server
```

Look for error messages and fix the underlying issue.


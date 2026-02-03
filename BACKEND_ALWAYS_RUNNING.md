# Backend Server - Always Running Setup

The backend server is now configured to run continuously using PM2, a process manager that keeps your server running even if it crashes or you restart your computer.

## ✅ Current Status

The server is **currently running** on `http://localhost:3001` and will:
- ✅ Automatically restart if it crashes
- ✅ Run in the background without blocking your terminal
- ✅ Persist until you explicitly stop it or restart your computer

**Note:** On Windows, PM2 doesn't auto-start on boot by default. If you want it to start automatically, you can:
1. Create a Windows Scheduled Task to run `pm2 resurrect` on login
2. Or simply run `.\manage-backend.ps1 start` after restarting your computer

## 🚀 Quick Commands

### Check Server Status
```powershell
.\manage-backend.ps1 status
```
or
```powershell
pm2 status
```

### View Server Logs
```powershell
.\manage-backend.ps1 logs
```
or
```powershell
pm2 logs mcp-api-server
```

### Restart Server
```powershell
.\manage-backend.ps1 restart
```

### Stop Server
```powershell
.\manage-backend.ps1 stop
```

### Start Server (if stopped)
```powershell
.\manage-backend.ps1 start
```

## 📊 PM2 Commands (Advanced)

### View All PM2 Processes
```powershell
pm2 list
```

### Monitor in Real-Time
```powershell
pm2 monitor
```

### View Detailed Info
```powershell
pm2 info mcp-api-server
```

### Delete Process (stops and removes from PM2)
```powershell
pm2 delete mcp-api-server
```

## 🔧 Troubleshooting

### Server Not Responding
1. Check if it's running: `pm2 status`
2. Check logs: `pm2 logs mcp-api-server`
3. Restart: `pm2 restart mcp-api-server`

### Port Already in Use
If port 3001 is already in use:
1. Find what's using it: `netstat -ano | findstr :3001`
2. Stop the other process or change the port in `server/ecosystem.config.js`

### Server Keeps Crashing
Check the logs to see the error:
```powershell
pm2 logs mcp-api-server --lines 50
```

## 🎯 What This Means

Your keyword research tool should now work! The "Failed to fetch" error should be gone because:
- ✅ Backend server is running on port 3001
- ✅ PM2 keeps it running automatically
- ✅ Server will restart if it crashes
- ✅ Server will start on system boot (after `pm2 startup`)

## 🔗 Server Endpoints

The server provides these endpoints:
- `POST /api/mcp/DataForSEO_dataforseo_labs_google_keyword_overview`
- `POST /api/mcp/DataForSEO_dataforseo_labs_google_keyword_ideas`
- `POST /api/mcp/DataForSEO_dataforseo_labs_google_related_keywords`
- `POST /api/mcp/DataForSEO_serp_organic_live_advanced`
- `GET /api/mcp/health` (health check)

## 📝 Notes

- The server runs in the background - you don't need to keep a terminal open
- Logs are saved to `server/logs/` directory
- PM2 configuration is in `server/ecosystem.config.js`
- Server credentials are configured for: `YOUR_DATAFORSEO_LOGIN`


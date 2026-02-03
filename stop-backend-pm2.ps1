# PowerShell script to stop the DataForSEO backend server running with PM2

Write-Host "Stopping DataForSEO MCP API Server..." -ForegroundColor Cyan
Write-Host ""

# Check if PM2 is installed
$pm2Installed = Get-Command pm2 -ErrorAction SilentlyContinue
if (-not $pm2Installed) {
    Write-Host "❌ PM2 not found. Server may not be running with PM2." -ForegroundColor Red
    exit 1
}

# Check if server is running
$existingProcess = pm2 list | Select-String "mcp-api-server"
if (-not $existingProcess) {
    Write-Host "⚠️  Server is not running with PM2." -ForegroundColor Yellow
    exit 0
}

# Stop the server
pm2 stop mcp-api-server
Write-Host "✅ Server stopped!" -ForegroundColor Green
Write-Host ""
Write-Host "To remove from PM2 completely, run: pm2 delete mcp-api-server" -ForegroundColor Yellow


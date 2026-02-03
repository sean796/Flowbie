# PowerShell script to start the DataForSEO backend server with PM2
# This keeps the server running in the background and auto-restarts on failure
# Run this from the project root directory

Write-Host "Starting DataForSEO MCP API Server with PM2..." -ForegroundColor Cyan
Write-Host ""

# Check if server directory exists
if (-not (Test-Path "server\mcp-api-server.js")) {
    Write-Host "❌ Error: server\mcp-api-server.js not found!" -ForegroundColor Red
    Write-Host "Please run this script from the project root directory." -ForegroundColor Yellow
    exit 1
}

# Check if PM2 is installed globally
$pm2Installed = Get-Command pm2 -ErrorAction SilentlyContinue
if (-not $pm2Installed) {
    Write-Host "⚠️  PM2 not found. Installing PM2 globally..." -ForegroundColor Yellow
    npm install -g pm2
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to install PM2!" -ForegroundColor Red
        Write-Host "Please install PM2 manually: npm install -g pm2" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "✅ PM2 installed!" -ForegroundColor Green
    Write-Host ""
}

# Check if node_modules exists in server directory
if (-not (Test-Path "server\node_modules")) {
    Write-Host "⚠️  Dependencies not installed. Installing..." -ForegroundColor Yellow
    Set-Location server
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to install dependencies!" -ForegroundColor Red
        exit 1
    }
    Set-Location ..
    Write-Host "✅ Dependencies installed!" -ForegroundColor Green
    Write-Host ""
}

# Create logs directory if it doesn't exist
if (-not (Test-Path "server\logs")) {
    New-Item -ItemType Directory -Path "server\logs" | Out-Null
}

# Check if server is already running
$existingProcess = pm2 list | Select-String "mcp-api-server"
if ($existingProcess) {
    Write-Host "⚠️  Server is already running. Restarting..." -ForegroundColor Yellow
    pm2 restart mcp-api-server
} else {
    Write-Host "🚀 Starting server on http://localhost:3001 with PM2..." -ForegroundColor Green
    Set-Location server
    pm2 start ecosystem.config.js --no-daemon
    Set-Location ..
}

Write-Host ""
Write-Host "✅ Server started!" -ForegroundColor Green
Write-Host ""
Write-Host "Useful PM2 commands:" -ForegroundColor Cyan
Write-Host "  pm2 status              - Check server status" -ForegroundColor White
Write-Host "  pm2 logs mcp-api-server - View server logs" -ForegroundColor White
Write-Host "  pm2 stop mcp-api-server - Stop the server" -ForegroundColor White
Write-Host "  pm2 restart mcp-api-server - Restart the server" -ForegroundColor White
Write-Host "  pm2 delete mcp-api-server - Remove from PM2" -ForegroundColor White
Write-Host ""
Write-Host "The server will now run in the background and auto-restart if it crashes." -ForegroundColor Green


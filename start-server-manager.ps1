# PowerShell script to start the Server Manager service
# Run this from the project root directory
# The Server Manager manages the keyword server lifecycle on-demand

Write-Host "Starting Server Manager Service..." -ForegroundColor Cyan
Write-Host ""

# Check if server directory exists
if (-not (Test-Path "server\server-manager.js")) {
    Write-Host "❌ Error: server\server-manager.js not found!" -ForegroundColor Red
    Write-Host "Please run this script from the project root directory." -ForegroundColor Yellow
    exit 1
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

# Start the server manager
Write-Host "🚀 Starting Server Manager on http://localhost:3002..." -ForegroundColor Green
Write-Host "📊 This service manages the keyword server (port 3001) on-demand" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop the server manager" -ForegroundColor Yellow
Write-Host ""

Set-Location server
node server-manager.js


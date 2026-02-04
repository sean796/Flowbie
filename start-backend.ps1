# PowerShell script to start the DataForSEO backend server
# Run this from the project root directory

Write-Host "Starting DataForSEO MCP API Server..." -ForegroundColor Cyan
Write-Host ""

# Check if server directory exists
if (-not (Test-Path "server\mcp-api-server.js")) {
    Write-Host "❌ Error: server\mcp-api-server.js not found!" -ForegroundColor Red
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

# Start the server (legacy OpenSSL provider required for GSC service account JWT)
Write-Host "🚀 Starting server on http://localhost:3001..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

Set-Location server
$env:NODE_OPTIONS = "--openssl-legacy-provider"
# Prefer server.js if present (full backend), else mcp-api-server.js
if (Test-Path "server.js") { node server.js } else { node mcp-api-server.js }


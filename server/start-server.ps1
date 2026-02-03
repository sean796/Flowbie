# PowerShell script to start the MCP API server
Write-Host "Starting MCP API Server..." -ForegroundColor Green

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Start the server
Write-Host "Starting server on http://localhost:3001" -ForegroundColor Cyan
node mcp-api-server.js


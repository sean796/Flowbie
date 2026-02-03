# PowerShell script to manage the DataForSEO backend server with PM2
# Run this from the project root directory

param(
    [Parameter(Position=0)]
    [ValidateSet("start", "stop", "restart", "status", "logs", "monitor")]
    [string]$Action = "status"
)

$ServerDir = "server"

Write-Host "`n🔧 Backend Server Manager" -ForegroundColor Cyan
Write-Host "========================`n" -ForegroundColor Cyan

switch ($Action) {
    "start" {
        Write-Host "🚀 Starting backend server..." -ForegroundColor Green
        Set-Location $ServerDir
        pm2 start ecosystem.config.js
        pm2 save
        Set-Location ..
        Write-Host "✅ Server started! It will keep running in the background." -ForegroundColor Green
        Write-Host "   Use 'pm2 status' to check status" -ForegroundColor Yellow
        Write-Host "   Use 'pm2 logs mcp-api-server' to view logs`n" -ForegroundColor Yellow
    }
    "stop" {
        Write-Host "🛑 Stopping backend server..." -ForegroundColor Yellow
        pm2 stop mcp-api-server
        pm2 save
        Write-Host "✅ Server stopped`n" -ForegroundColor Green
    }
    "restart" {
        Write-Host "🔄 Restarting backend server..." -ForegroundColor Yellow
        pm2 restart mcp-api-server
        Write-Host "✅ Server restarted`n" -ForegroundColor Green
    }
    "status" {
        Write-Host "📊 Server Status:" -ForegroundColor Cyan
        pm2 status
        Write-Host ""
        Write-Host "💡 Quick Commands:" -ForegroundColor Yellow
        Write-Host "   .\manage-backend.ps1 start    - Start the server" -ForegroundColor White
        Write-Host "   .\manage-backend.ps1 stop     - Stop the server" -ForegroundColor White
        Write-Host "   .\manage-backend.ps1 restart  - Restart the server" -ForegroundColor White
        Write-Host "   .\manage-backend.ps1 logs     - View server logs" -ForegroundColor White
        Write-Host "   .\manage-backend.ps1 monitor  - Monitor server in real-time`n" -ForegroundColor White
    }
    "logs" {
        Write-Host "📋 Server Logs (Press Ctrl+C to exit):`n" -ForegroundColor Cyan
        pm2 logs mcp-api-server
    }
    "monitor" {
        Write-Host "📊 Starting PM2 Monitor (Press Ctrl+C to exit):`n" -ForegroundColor Cyan
        pm2 monitor
    }
}


# Universal start script - Starts backend server, frontend dev server, and opens browser
# Run this from the project root directory

param(
    [switch]$NoBrowser
)

Write-Host "🚀 Starting all services..." -ForegroundColor Cyan
Write-Host ""

# Check if server directory exists
if (-not (Test-Path "server\server.js")) {
    Write-Host "❌ Error: server\server.js not found!" -ForegroundColor Red
    Write-Host "Please run this script from the project root directory." -ForegroundColor Yellow
    exit 1
}

# Check if server dependencies are installed
if (-not (Test-Path "server\node_modules")) {
    Write-Host "⚠️  Installing server dependencies..." -ForegroundColor Yellow
    Set-Location server
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to install server dependencies!" -ForegroundColor Red
        exit 1
    }
    Set-Location ..
    Write-Host "✅ Server dependencies installed!" -ForegroundColor Green
    Write-Host ""
}

# Check if root dependencies are installed
if (-not (Test-Path "node_modules")) {
    Write-Host "⚠️  Installing root dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to install root dependencies!" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Root dependencies installed!" -ForegroundColor Green
    Write-Host ""
}

# Function to check if a port is listening
function Test-Port {
    param([int]$Port)
    try {
        $connection = Test-NetConnection -ComputerName localhost -Port $Port -WarningAction SilentlyContinue -InformationLevel Quiet
        return $connection
    } catch {
        return $false
    }
}

# Function to wait for server to be ready
function Wait-ForServer {
    param(
        [int]$Port,
        [string]$ServerName,
        [int]$MaxWaitSeconds = 30
    )
    $elapsed = 0
    Write-Host "⏳ Waiting for $ServerName to be ready on port $Port..." -ForegroundColor Yellow
    while ($elapsed -lt $MaxWaitSeconds) {
        if (Test-Port -Port $Port) {
            Write-Host "✅ $ServerName is ready!" -ForegroundColor Green
            Start-Sleep -Seconds 1
            return $true
        }
        Start-Sleep -Seconds 1
        $elapsed++
        Write-Host "." -NoNewline -ForegroundColor Gray
    }
    Write-Host ""
    Write-Host "⚠️  $ServerName may not be ready yet, but continuing..." -ForegroundColor Yellow
    return $false
}

# Start backend server in background (legacy OpenSSL provider required for GSC service account JWT)
Write-Host "🔧 Starting backend server (port 3001)..." -ForegroundColor Cyan
$backendJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    Set-Location server
    $env:NODE_OPTIONS = "--openssl-legacy-provider"
    node server.js
}

# Wait a moment for backend to start
Start-Sleep -Seconds 2

# Wait for backend to be ready
Wait-ForServer -Port 3001 -ServerName "Backend server" -MaxWaitSeconds 15

Write-Host ""
Write-Host "🎨 Starting frontend dev server (port 8080)..." -ForegroundColor Cyan
Write-Host ""

# Start frontend dev server in background
$frontendJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    npm run dev 2>&1
}

# Wait for frontend to be ready
Wait-ForServer -Port 8080 -ServerName "Frontend dev server" -MaxWaitSeconds 30

Write-Host ""
Write-Host "✅ All services are running!" -ForegroundColor Green
Write-Host ""
Write-Host "📍 Backend API:  http://localhost:3001" -ForegroundColor Cyan
Write-Host "📍 Frontend:     http://localhost:8080" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop all services" -ForegroundColor Yellow
Write-Host ""

# Open browser if not disabled
if (-not $NoBrowser) {
    Write-Host "🌐 Opening browser..." -ForegroundColor Cyan
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:8080"
}

# Function to cleanup on exit
function Cleanup {
    Write-Host ""
    Write-Host "🛑 Stopping all services..." -ForegroundColor Yellow
    if ($backendJob) {
        Stop-Job -Job $backendJob -ErrorAction SilentlyContinue
        Remove-Job -Job $backendJob -ErrorAction SilentlyContinue
    }
    if ($frontendJob) {
        Stop-Job -Job $frontendJob -ErrorAction SilentlyContinue
        Remove-Job -Job $frontendJob -ErrorAction SilentlyContinue
    }
    # Kill any remaining node processes on the ports
    Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    Write-Host "✅ All services stopped." -ForegroundColor Green
    exit
}

# Register cleanup on Ctrl+C
[Console]::TreatControlCAsInput = $false
Register-ObjectEvent -InputObject ([System.Console]) -EventName CancelKeyPress -Action {
    Cleanup
} | Out-Null

# Show logs from both jobs
try {
    while ($true) {
        # Show backend logs
        $backendOutput = Receive-Job -Job $backendJob -ErrorAction SilentlyContinue
        if ($backendOutput) {
            Write-Host "[BACKEND] $backendOutput" -ForegroundColor Magenta
        }
        
        # Show frontend logs
        $frontendOutput = Receive-Job -Job $frontendJob -ErrorAction SilentlyContinue
        if ($frontendOutput) {
            Write-Host "[FRONTEND] $frontendOutput" -ForegroundColor Blue
        }
        
        # Check if jobs are still running
        if ($backendJob.State -eq "Failed" -or $frontendJob.State -eq "Failed") {
            Write-Host "❌ One of the services has failed!" -ForegroundColor Red
            Cleanup
        }
        
        Start-Sleep -Milliseconds 500
    }
} catch {
    Cleanup
}


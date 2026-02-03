@echo off
REM Universal start script - Starts backend server, frontend dev server, Python ML service
REM CRITICAL: This window will NEVER close automatically

setlocal enabledelayedexpansion

echo.
echo ========================================
echo   Starting All Services
echo ========================================
echo.
echo [INFO] This window will NEVER close automatically.
echo [INFO] You must manually close it (X button or Ctrl+C).
echo.

REM Start Python ML service (if it exists, don't check, just try to start it)
echo [INFO] Starting Python ML service on port 8000...
start "Python ML Service (Port 8000)" cmd /k "cd /d %~dp0server\python-ml-service && python app.py"
echo [OK] Python ML service window opened.
echo.

REM Kill any existing processes on ports 3001 and 3002
echo [INFO] Checking for existing processes on ports 3001 and 3002...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do (
    echo [INFO] Killing process %%a on port 3001...
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3002') do (
    echo [INFO] Killing process %%a on port 3002...
    taskkill /F /PID %%a >nul 2>&1
)
echo [OK] Port cleanup complete.
echo.

REM Start server manager (must start before backend server)
echo [INFO] Starting server manager on port 3002...
start "Server Manager (Port 3002)" cmd /k "cd /d %~dp0server && node server-manager.js"
echo [OK] Server manager window opened.
echo.

REM Wait a moment for server manager to start
timeout /t 2 /nobreak >nul

REM Start backend server
echo [INFO] Starting backend server on port 3001...
start "Backend Server (Port 3001)" cmd /k "cd /d %~dp0server && node server.js"
echo [OK] Backend server window opened.
echo.

REM Wait a moment
timeout /t 2 /nobreak >nul

REM Start frontend dev server
echo [INFO] Starting frontend dev server on port 8080...
start "Frontend Dev Server (Port 8080)" cmd /k "cd /d %~dp0 && npm run dev"
echo [OK] Frontend dev server window opened.
echo.

REM Wait a moment
timeout /t 2 /nobreak >nul

REM Open browser
echo [INFO] Opening browser...
start http://localhost:8080
echo.

echo ========================================
echo   All Services Started
echo ========================================
echo.
echo Python ML Service: http://localhost:8000
echo Server Manager:  http://localhost:3002
echo Backend API:     http://localhost:3001
echo Frontend:         http://localhost:8080
echo.
echo ========================================
echo   Window will NEVER close automatically
echo ========================================
echo.
echo This window will stay open FOREVER.
echo Close it manually (X button or Ctrl+C) to exit.
echo.

REM INFINITE LOOP - NEVER EXITS
:keep_open
timeout /t 30 /nobreak >nul
goto keep_open

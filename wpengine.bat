@echo off
REM Deploy dist/ to WP Engine via SFTP (to subdirectory /public/app/ by default)
REM Requires wpengine-deploy.config.json (copy from wpengine-deploy.config.example.json)
REM Set WPENGINE_SUBPATH= to deploy to site root; default is "app" for flowbie.ca/app/

setlocal
cd /d "%~dp0"

echo.
echo ========================================
echo   WP Engine Deploy
echo ========================================
echo.

if not exist "wpengine-deploy.config.json" (
  echo [ERROR] wpengine-deploy.config.json not found.
  echo Copy wpengine-deploy.config.example.json to wpengine-deploy.config.json
  echo and fill in your site, host, username, password, remotePath.
  echo.
  pause
  exit /b 1
)

if not defined WPENGINE_SUBPATH set WPENGINE_SUBPATH=app
echo [INFO] Deploying to subdirectory: %WPENGINE_SUBPATH%
echo.

REM Build with base path so app works at flowbie.ca/app/
set VITE_BASE_PATH=/%WPENGINE_SUBPATH%/
echo [INFO] Building for base path %VITE_BASE_PATH%...
call npm run build
if errorlevel 1 (
  echo [ERROR] Build failed.
  pause
  exit /b 1
)
echo.

echo [INFO] Uploading to WP Engine...
call npm run deploy:wpengine
if errorlevel 1 (
  echo.
  echo [ERROR] Deploy failed.
  pause
  exit /b 1
)

echo.
echo [OK] Deploy completed.
echo.
pause

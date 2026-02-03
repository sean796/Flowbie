@echo off
title Push Flowbie to GitHub (one clean commit, no secrets in history)
cd /d "%~dp0"

echo.
echo This replaces your Git history with ONE commit (current folder only).
echo Use this to fix "Push cannot contain secrets" when the secret is in OLD commits.
echo.
set /p confirm="Type YES to continue: "
if /i not "%confirm%"=="YES" (
  echo Aborted.
  pause
  exit /b 1
)

if not exist ".git" (
  echo No .git found. Run fullupdater.bat first to init and build.
  pause
  exit /b 1
)

set REMOTE=origin
set BRANCH=main
git remote set-url %REMOTE% https://github.com/sean796/Flowbie.git 2>nul

echo Creating one clean commit (no old history)...
git checkout --orphan temp_clean
git add -A
git commit -m "Flowbie: single clean commit (no secrets in history)"
git branch -D %BRANCH%
git branch -m %BRANCH%
echo.
echo Pushing to GitHub (force-push; this may ask for login)...
git push -f %REMOTE% %BRANCH%
if errorlevel 1 (
  echo.
  echo Push failed. Try: git push -f origin main
  echo If still blocked, remove any remaining secrets from the repo and run this again.
) else (
  echo.
  echo Done. GitHub main now has one commit with no secrets in history.
)
echo.
pause

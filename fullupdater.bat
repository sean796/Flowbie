@echo off
setlocal enabledelayedexpansion
title Git Update - Flowbie
cd /d "%~dp0"

if exist "%~dp0deploy-env.bat" call "%~dp0deploy-env.bat"

echo.
echo Building Flowbie...
call npm run build
if errorlevel 1 (
  echo BUILD FAILED.
  goto :finish
)

:: --- GIT SECTION ---
echo.
echo Git: sync to GitHub...
if not exist ".git" (
  echo Initializing new Git repo...
  git init
)
git branch -M main

:: Always point origin at your GitHub repo (fixes wrong or missing remote)
set GITHUB_REPO_URL=https://github.com/sean796/Flowbie.git
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo Adding remote origin...
  git remote add origin "%GITHUB_REPO_URL%"
) else (
  echo Setting remote origin to GitHub...
  git remote set-url origin "%GITHUB_REPO_URL%"
)

:: Add everything (all new and changed files)
git add -A
git status
echo.

:: Commit with date/time message (nothing to commit is OK)
set "COMMIT_MSG=update %date% %time:~0,8%"
set "COMMIT_MSG=%COMMIT_MSG: =0%"
git commit -m "%COMMIT_MSG%" 2>nul
if errorlevel 1 (
  echo Nothing new to commit.
) else (
  echo Committed.
)

:: Push full repo to GitHub (creates/updates origin/main)
echo.
echo Pushing to GitHub...
git push -u origin main
if errorlevel 1 (
  echo.
  echo PUSH FAILED.
  echo.
  echo If blocked by "secrets" or "GH013", run push-clean-to-github.bat to fix.
  set /p RUN_CLEAN="Run clean push now? (YES to replace history with one commit): "
  if /i "!RUN_CLEAN!"=="YES" (
    echo.
    echo Creating clean commit and force-pushing...
    git checkout --orphan temp_clean
    git add -A
    git commit -m "Flowbie: single clean commit (no secrets in history)"
    git branch -D main
    git branch -m main
    git push -f origin main
    if errorlevel 1 (
      echo Clean push also failed. Try running push-clean-to-github.bat manually.
    ) else (
      echo Done. GitHub main now has one commit with no secrets in history.
    )
  ) else (
    echo Create the repo on GitHub first if needed: https://github.com/new ^(name: Flowbie^)
  )
)

:finish
echo.
echo ----------------------------------------
pause
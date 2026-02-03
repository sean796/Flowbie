@echo off
setlocal enabledelayedexpansion
REM update.bat - Init a new GitHub repo or push changes to an existing one

set "COMMIT_MSG=%~1"
if "%COMMIT_MSG%"=="" set "COMMIT_MSG=Update %date% %time%"

echo.
echo ========================================
echo   GitHub Update
echo ========================================
echo.

REM 1. Check for Git
git --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git is not installed or not in PATH.
    echo Install Git from https://git-scm.com/ and try again.
    exit /b 1
)
echo [OK] Git found.

REM 2. No repo yet -> init and optionally create on GitHub
if not exist ".git" (
    echo.
    echo [INFO] No Git repo found. Initializing...
    git init
    git branch -M main
    echo [OK] Repo initialized with branch 'main'.

    where gh >nul 2>&1
    if errorlevel 1 (
        echo.
        echo [INFO] GitHub CLI 'gh' not found. To push you need to:
        echo   1. Create a new repo on https://github.com/new
        echo   2. Run: git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
        echo   3. Run this script again to commit and push.
        echo.
        git add -A
        git status
        exit /b 0
    )

    echo.
    set /p "CREATE_REPO=Create repo on GitHub with 'gh'? (y/n): "
    if /i "!CREATE_REPO!"=="y" (
        set /p "REPO_NAME=Repo name (e.g. Flowbie): "
        if "!REPO_NAME!"=="" set "REPO_NAME=Flowbie"
        set /p "REPO_VIS=Private? (y/n, default y): "
        if /i "!REPO_VIS!"=="n" (
            gh repo create "!REPO_NAME!" --public --source=. --remote=origin --push
        ) else (
            gh repo create "!REPO_NAME!" --private --source=. --remote=origin --push
        )
        if errorlevel 1 (
            echo [WARN] 'gh repo create' failed. Add remote manually and run this script again.
        ) else (
            echo [OK] Repo created and first push done.
        )
        exit /b 0
    )

    echo [INFO] Add remote and run this script again to push.
    git add -A
    git status
    exit /b 0
)

REM 3. Repo exists but no origin -> CREATE REPO with GitHub CLI
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo.
    echo [INFO] No 'origin' remote. Creating repo on GitHub...
    where gh >nul 2>&1
    if errorlevel 1 (
        echo.
        echo [ERROR] GitHub CLI 'gh' is required to create the repo from this script.
        echo Install it from https://cli.github.com/
        echo Then run: gh auth login
        echo Then run this script again.
        echo.
        exit /b 1
    )
    REM Must have at least one commit before --push
    git rev-parse HEAD >nul 2>&1
    if errorlevel 1 (
        echo [INFO] No commits yet. Making initial commit...
        git add -A
        git commit -m "Initial commit"
        if errorlevel 1 (
            echo [ERROR] Initial commit failed. Check git status.
            exit /b 1
        )
        echo [OK] Initial commit done.
    )
    set "REPO_NAME=Flowbie"
    set /p "REPO_NAME=Repo name (Enter = Flowbie): "
    if "!REPO_NAME!"=="" set "REPO_NAME=Flowbie"
    set "REPO_VIS=private"
    set /p "REPO_VIS=Private repo? (Y/n, Enter = yes): "
    if /i "!REPO_VIS!"=="n" (
        gh repo create "!REPO_NAME!" --public --source=. --remote=origin --push
    ) else (
        gh repo create "!REPO_NAME!" --private --source=. --remote=origin --push
    )
    if errorlevel 1 (
        echo.
        echo [ERROR] Could not create repo. If not logged in, run: gh auth login
        exit /b 1
    )
    echo.
    echo [OK] Repo created and pushed to GitHub.
    echo ========================================
    exit /b 0
)
echo [OK] Remote 'origin' is set.

REM Optional: warn if .env is staged (should be ignored)
git add -A
git diff --cached --name-only | findstr /i "\.env$ \.env\.local$" >nul 2>&1
if not errorlevel 1 (
    echo [WARN] .env or .env.local is staged. Ensure .gitignore contains .env and .env.local.
    echo [WARN] Unstaging .env files to avoid committing secrets...
    git reset HEAD .env .env.local 2>nul
)

git diff --staged --quiet
if errorlevel 1 (
    git commit -m "%COMMIT_MSG%"
    if errorlevel 1 (
        echo [ERROR] Commit failed.
        exit /b 1
    )
    echo [OK] Committed.
) else (
    echo [INFO] No changes to commit.
)

set "BRANCH=main"
git rev-parse --verify main >nul 2>&1
if errorlevel 1 (
    git rev-parse --verify master >nul 2>&1
    if not errorlevel 1 set "BRANCH=master"
)

echo [INFO] Pushing to origin %BRANCH%...
git push -u origin %BRANCH%
if errorlevel 1 (
    echo [ERROR] Push failed. Check remote URL and credentials.
    exit /b 1
)

echo.
echo ========================================
echo   Done. Changes pushed to GitHub.
echo ========================================
echo.
exit /b 0

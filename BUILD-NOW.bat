@echo off
setlocal EnableDelayedExpansion
title Galaxy APK - Build
cd /d "%~dp0"

echo.
echo ========================================
echo   Galaxy APK Builder
echo   Folder: %CD%
echo ========================================
echo.

if not exist "package.json" (
  echo ERROR: package.json not found in this folder.
  echo You must put BUILD-NOW.bat INSIDE the project folder
  echo (the folder that contains package.json and capacitor.config.ts).
  pause
  exit /b 1
)

where node >nul 2>nul || (echo ERROR: Install Node.js LTS from https://nodejs.org then reopen. & pause & exit /b 1)
where npm  >nul 2>nul || (echo ERROR: npm missing. Reinstall Node.js. & pause & exit /b 1)

echo [1/5] npm install (this may take 3-5 minutes the first time)...
call npm install --no-audit --no-fund
if errorlevel 1 (echo npm install failed & pause & exit /b 1)

echo.
echo [2/5] Building web (vite build)...
call npx --no-install vite build
if errorlevel 1 (echo vite build failed & pause & exit /b 1)

echo.
echo [3/5] Adding Android platform if missing...
if not exist "android" (
  call npx --no-install cap add android
  if errorlevel 1 (echo cap add android failed & pause & exit /b 1)
)

echo.
echo [4/5] Syncing Capacitor...
call npx --no-install cap sync android
if errorlevel 1 (echo cap sync failed & pause & exit /b 1)

echo.
echo [5/5] Building APK with Gradle...
pushd android
call gradlew.bat assembleDebug
set GRADLE_EXIT=%ERRORLEVEL%
popd
if not "%GRADLE_EXIT%"=="0" (echo Gradle build failed & pause & exit /b 1)

echo.
echo ========================================
echo   BUILD SUCCESSFUL
echo ========================================
echo APK file:
echo   %CD%\android\app\build\outputs\apk\debug\app-debug.apk
echo.
explorer "%CD%\android\app\build\outputs\apk\debug"
pause

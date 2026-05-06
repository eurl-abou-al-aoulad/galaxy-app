@echo off
setlocal
title Galaxy APK Builder

echo.
echo ===============================
echo  Galaxy Android APK Builder
echo ===============================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not added to PATH.
  echo Install Node.js LTS from https://nodejs.org then reopen this file.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm is not available.
  echo Reinstall Node.js LTS from https://nodejs.org then reopen this file.
  pause
  exit /b 1
)

where git >nul 2>nul
if errorlevel 1 (
  echo WARNING: Git is not installed or not added to PATH.
  echo The project will be built without git pull.
) else (
  echo Updating project...
  git pull
)

echo.
echo Installing dependencies...
npm install
if errorlevel 1 (
  echo ERROR: npm install failed.
  pause
  exit /b 1
)

echo.
echo Checking project files...
npm run verify:apk-project
if errorlevel 1 (
  echo ERROR: Project files are incomplete. Read the message above.
  pause
  exit /b 1
)

echo.
echo Building offline APK...
npm run android:apk:win
if errorlevel 1 (
  echo ERROR: APK build failed.
  pause
  exit /b 1
)

echo.
echo BUILD SUCCESSFUL
echo APK location:
echo android\app\build\outputs\apk\debug\app-debug.apk
echo.
pause

@echo off
setlocal EnableDelayedExpansion
title Galaxy Auto Builder - One Click APK
color 0B
chcp 65001 >nul

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   GALAXY AUTO BUILDER - ONE CLICK APK   ║
echo  ║   لا تكتب أي شيء - فقط انتظر            ║
echo  ╚══════════════════════════════════════════╝
echo.

REM ================================================
REM  STEP 0: Locate project folder automatically
REM ================================================
set "PROJECT_DIR="

REM Try current folder first
if exist "%~dp0package.json" (
  set "PROJECT_DIR=%~dp0"
  goto :found
)

echo [Search] Looking for project folder on Desktop...
for /d %%D in ("%USERPROFILE%\Desktop\*") do (
  if exist "%%D\package.json" if exist "%%D\capacitor.config.ts" (
    set "PROJECT_DIR=%%D\"
    goto :found
  )
)

REM Try one level deeper (extracted ZIPs often have nested folder)
for /d %%D in ("%USERPROFILE%\Desktop\*") do (
  for /d %%E in ("%%D\*") do (
    if exist "%%E\package.json" if exist "%%E\capacitor.config.ts" (
      set "PROJECT_DIR=%%E\"
      goto :found
    )
  )
)

echo.
echo  ❌ لم أجد مجلد المشروع تلقائياً.
echo  ضع هذا الملف داخل مجلد المشروع (حيث يوجد package.json) ثم شغّله.
echo.
pause
exit /b 1

:found
echo  ✅ Project found: !PROJECT_DIR!
cd /d "!PROJECT_DIR!"
echo.

REM ================================================
REM  STEP 1: Install Node.js if missing (via winget)
REM ================================================
where node >nul 2>nul
if errorlevel 1 (
  echo [1/6] Node.js غير مثبت - جاري التثبيت تلقائياً...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo  ❌ فشل التثبيت التلقائي. حمّل يدوياً من https://nodejs.org ثم أعد التشغيل.
    pause
    exit /b 1
  )
  echo  ⚠️  أغلق هذه النافذة وافتح الملف مرة أخرى لتفعيل Node.
  pause
  exit /b 0
) else (
  echo [1/6] ✅ Node.js مثبت
)

REM ================================================
REM  STEP 2: npm install
REM ================================================
echo.
echo [2/6] تثبيت الحزم (قد يأخذ 3-5 دقائق أول مرة)...
call npm install --no-audit --no-fund --silent
if errorlevel 1 (
  echo  ❌ فشل npm install
  pause
  exit /b 1
)
echo  ✅ تم تثبيت الحزم

REM ================================================
REM  STEP 3: Build web (vite)
REM ================================================
echo.
echo [3/6] بناء واجهة الويب...
call npx --no-install vite build
if errorlevel 1 (
  echo  ❌ فشل vite build
  pause
  exit /b 1
)
echo  ✅ تم بناء الويب

REM ================================================
REM  STEP 4: Add Android platform
REM ================================================
echo.
echo [4/6] تجهيز منصة Android...
if not exist "android" (
  call npx --no-install cap add android
  if errorlevel 1 (
    echo  ❌ فشل cap add
    pause
    exit /b 1
  )
)
echo  ✅ منصة Android جاهزة

REM ================================================
REM  STEP 5: Sync Capacitor
REM ================================================
echo.
echo [5/6] مزامنة Capacitor...
call npx --no-install cap sync android
if errorlevel 1 (
  echo  ❌ فشل cap sync
  pause
  exit /b 1
)
echo  ✅ تمت المزامنة

REM ================================================
REM  STEP 6: Build APK with Gradle
REM ================================================
echo.
echo [6/6] بناء ملف APK (قد يأخذ 5-10 دقائق أول مرة)...
pushd android
call gradlew.bat assembleDebug
set "GRADLE_EXIT=!ERRORLEVEL!"
popd

if not "!GRADLE_EXIT!"=="0" (
  echo.
  echo  ❌ فشل بناء Gradle
  echo  تأكد من تثبيت Android Studio + JDK 17 من https://developer.android.com/studio
  pause
  exit /b 1
)

REM ================================================
REM  SUCCESS
REM ================================================
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║          ✅  BUILD SUCCESSFUL  ✅         ║
echo  ╚══════════════════════════════════════════╝
echo.
echo  📱 ملف APK جاهز في:
echo     !PROJECT_DIR!android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo  جاري فتح المجلد...
start "" explorer "!PROJECT_DIR!android\app\build\outputs\apk\debug"
echo.
pause

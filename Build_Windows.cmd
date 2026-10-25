@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install the current Node.js LTS version from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
echo Installing the pinned build tools...
call npm ci
if errorlevel 1 goto failed
echo Building the portable Windows application...
call npm run build:windows
if errorlevel 1 goto failed
echo.
echo The standalone executable is in the dist folder.
start "" "%~dp0dist"
pause
exit /b 0
:failed
echo.
echo The build did not finish. Review the error above.
pause
exit /b 1

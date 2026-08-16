@echo off
title The Audiopheliac - GDMARCHE
color 0E
cd /d "%~dp0"

echo.
echo   The Audiopheliac
echo   This PC is GDMARCHE. Tablets talk to this computer.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js is missing. I will open the download page.
  echo   Install the LTS version, then double-click GO again.
  echo.
  start https://nodejs.org
  pause
  exit /b 1
)

for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8099" ^| findstr "LISTENING"') do (
  echo   Stopping the old remote on this PC...
  taskkill /PID %%P /F >nul 2>nul
)

echo   Starting the house remote...
echo   Leave this window open.
echo.
node heal.js
echo.
echo   The window closed. Double-click GO on the desktop to start again.
pause
@echo off
title The Audiopheliac — desktop icon
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Create-Desktop-Icon.ps1"
if errorlevel 1 (
  echo Icon install failed.
  pause
  exit /b 1
)
echo.
pause

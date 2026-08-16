@echo off
title Audiopheliac Family Remote
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed.
  echo   Install LTS from https://nodejs.org  then run this again.
  echo.
  pause
  exit /b 1
)
echo.
echo   Starting The Audiopheliac relay...
echo   Leave this window open.
echo   Tablet: http://192.168.1.119:8099
echo.
node relay.js
pause

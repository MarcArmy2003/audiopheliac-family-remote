@echo off
title The Audiopheliac
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Opening https://nodejs.org — install LTS, then run GO.cmd again.
  start https://nodejs.org
  pause
  exit /b 1
)
echo Starting The Audiopheliac on this PC...
start "Audiopheliac Relay" cmd /c "title Audiopheliac Relay & node relay.js & pause"
timeout /t 2 /nobreak >nul
start http://127.0.0.1:8099
echo.
echo  This PC:   http://127.0.0.1:8099
echo  iPhone / iPad / tablet — use Safari on this address:
for /f "usebackq delims=" %%I in (`node -e "const os=require('os');for (const a of Object.values(os.networkInterfaces()).flat()){if(a&&!a.internal&&(a.family==='IPv4'||a.family===4)&&a.address.startsWith('192.168.')) console.log('             http://'+a.address+':8099')}"`) do echo %%I
echo.
echo  iPhone: Safari only. Share (box+arrow) → Add to Home Screen.
echo  Allow Windows Firewall if it pops.
echo  Leave the "Audiopheliac Relay" window open.
echo.
pause

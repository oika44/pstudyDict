@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Please install it from https://nodejs.org/
  pause
  exit /b 1
)
start "" http://localhost:4321
node server.mjs
pause

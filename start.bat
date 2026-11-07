@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18+ is required. Please install it first.
  pause
  exit /b 1
)
start "" http://localhost:5173/
node server.mjs

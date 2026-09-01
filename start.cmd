@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 18 or newer from https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules\express npm install
echo Starting OfferPilot Light at http://localhost:5175
npm start
pause

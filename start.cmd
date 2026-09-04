@echo off
setlocal
cd /d "%~dp0"
if not defined PORT set "PORT=5175"
where py >nul 2>nul
if errorlevel 1 (
  echo Please install Python 3.10 or newer from https://www.python.org/
  pause
  exit /b 1
)
if not exist .venv\Scripts\python.exe py -3 -m venv .venv
if not exist .venv\.requirements-installed goto install_deps
for /f %%A in ('powershell -NoProfile -Command "if ((Get-Item requirements.txt).LastWriteTime -gt (Get-Item .venv\.requirements-installed).LastWriteTime) { 'outdated' }"') do if "%%A"=="outdated" goto install_deps
goto start_server
:install_deps
.venv\Scripts\python.exe -m pip install -r requirements.txt
type nul > .venv\.requirements-installed
:start_server
echo Starting OfferPilot Light at http://localhost:%PORT%
start "OfferPilot Light" /b .venv\Scripts\python.exe -m uvicorn agent:app --host 127.0.0.1 --port %PORT%
timeout /t 2 /nobreak >nul
start "" http://localhost:%PORT%
pause

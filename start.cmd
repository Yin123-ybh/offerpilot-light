@echo off
setlocal
where py >nul 2>nul
if errorlevel 1 (
  echo Please install Python 3.10 or newer from https://www.python.org/
  pause
  exit /b 1
)
if not exist .venv\Scripts\python.exe py -3 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
echo Starting OfferPilot Light at http://localhost:5175
.venv\Scripts\python.exe -m uvicorn agent:app --host 127.0.0.1 --port 5175
pause

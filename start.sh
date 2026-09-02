#!/usr/bin/env sh
set -eu
if ! command -v python3 >/dev/null 2>&1; then
  echo "Please install Python 3.10 or newer from https://www.python.org/"
  exit 1
fi
if [ ! -x .venv/bin/python ]; then python3 -m venv .venv; fi
.venv/bin/python -m pip install -r requirements.txt
echo "Starting OfferPilot Light at http://localhost:5175"
.venv/bin/python -m uvicorn agent:app --host 127.0.0.1 --port 5175

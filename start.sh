#!/usr/bin/env sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"
PORT=${PORT:-5175}
if ! command -v python3 >/dev/null 2>&1; then
  echo "Please install Python 3.10 or newer from https://www.python.org/"
  exit 1
fi
if [ ! -x .venv/bin/python ]; then python3 -m venv .venv; fi
if [ ! -f .venv/.requirements-installed ] || [ requirements.txt -nt .venv/.requirements-installed ]; then
  .venv/bin/python -m pip install -r requirements.txt
  touch .venv/.requirements-installed
fi
echo "Starting OfferPilot Light at http://localhost:${PORT}"
.venv/bin/python -m uvicorn agent:app --host 127.0.0.1 --port "$PORT" &
SERVER_PID=$!
cleanup() { kill "$SERVER_PID" 2>/dev/null || true; }
trap cleanup INT TERM EXIT
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
    if command -v open >/dev/null 2>&1; then open "http://localhost:${PORT}"; fi
    break
  fi
  sleep 1
done
wait "$SERVER_PID"

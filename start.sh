#!/usr/bin/env sh
set -eu
if ! command -v node >/dev/null 2>&1; then
  echo "Please install Node.js 18 or newer from https://nodejs.org/"
  exit 1
fi
if [ ! -d node_modules/express ]; then npm install; fi
echo "Starting OfferPilot Light at http://localhost:5175"
npm start

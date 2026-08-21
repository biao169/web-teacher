#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8003}"
URL="http://${HOST}:${PORT}"

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="${PYTHON_BIN:-python3}"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="${PYTHON_BIN:-python}"
else
  echo "[ERROR] Python was not found. Please install Python 3.11+."
  read -r -p "Press Enter to close..."
  exit 1
fi

echo "Starting teacher site..."
echo "Project: ${ROOT}"
echo "URL:     ${URL}"
echo

if command -v xdg-open >/dev/null 2>&1; then
  (sleep 2 && xdg-open "$URL" >/dev/null 2>&1 || true) &
fi

"$PYTHON_BIN" -m tools.dev_server --host "$HOST" --port "$PORT"

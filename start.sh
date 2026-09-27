#!/usr/bin/env bash
# Ubuntu/Debian direct startup; no reset, demo import, firewall or proxy changes.
# Set TEACHER_PYTHON to the absolute Python 3.12+ executable (spaces are supported).
# Set TEACHER_VENV for the virtual environment; TEACHER_CONFIG for an external TOML.
# Storage template: deploy/shared/config/storage.example.toml.
# Examples: TEACHER_PYTHON=/opt/python/bin/python3 TEACHER_CONFIG=/etc/tweb/storage.toml bash start.sh
set -euo pipefail
cd "$(dirname "$0")"
TEACHER_RUN_PYTHON="${TEACHER_PYTHON:-python3}"
if [[ -z "${TEACHER_PYTHON:-}" ]]; then
  if [[ -n "${TEACHER_VENV:-}" && -x "$TEACHER_VENV/bin/python" ]]; then
    TEACHER_RUN_PYTHON="$TEACHER_VENV/bin/python"
  elif [[ -x .venv/bin/python ]]; then
    TEACHER_RUN_PYTHON=.venv/bin/python
  fi
fi
export PYTHONUTF8=1
exec "$TEACHER_RUN_PYTHON" deploy/shared/launcher.py start --profile normal --no-browser "$@"

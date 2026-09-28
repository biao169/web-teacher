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
# Optional --port is translated to the existing shared launcher's environment.
# TEACHER_PORT=9003 bash start.sh is equivalent; fast transfer shares this port.
teacher_args=()
while (($#)); do
  if [[ $1 == --port ]]; then
    (($# >= 2)) || { printf 'Missing port / 缺少端口\n' >&2; exit 2; }
    export TEACHER_PORT="$2"; shift 2
  else teacher_args+=("$1"); shift; fi
done
TEACHER_PORT=${TEACHER_PORT:-8003}
[[ $TEACHER_PORT =~ ^[0-9]{1,5}$ ]] && ((10#$TEACHER_PORT >= 1024 && 10#$TEACHER_PORT <= 65535)) || { printf 'Invalid port / 端口须为 1024–65535\n' >&2; exit 2; }
export TEACHER_PORT=$((10#$TEACHER_PORT))
export PYTHONUTF8=1
exec "$TEACHER_RUN_PYTHON" deploy/shared/launcher.py start --profile normal --no-browser "${teacher_args[@]}"

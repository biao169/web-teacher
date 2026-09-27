#!/usr/bin/env bash
# Compatibility entry: one teacher-site service, no separate transfer port.
set -euo pipefail
exec bash "$(dirname "$0")/start.sh" "$@"

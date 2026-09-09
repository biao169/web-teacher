#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm check:cloudflare
node test-examples/runtime-smoke.mjs

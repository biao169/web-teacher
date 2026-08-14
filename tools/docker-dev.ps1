$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  docker compose -f docker-compose.tools.yml run --rm --service-ports node-tools npm run dev -- --ip 0.0.0.0
}
finally {
  Pop-Location
}

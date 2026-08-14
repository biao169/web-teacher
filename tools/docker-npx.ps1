param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  docker compose -f docker-compose.tools.yml run --rm node-tools npx @Args
}
finally {
  Pop-Location
}

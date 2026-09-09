param([string]$Action = 'check')
$ErrorActionPreference = 'Stop'
try {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($node) { $exe = $node.Source }
  elseif ($env:CODEX_PRIMARY_RUNTIME_NODE) { $exe = $env:CODEX_PRIMARY_RUNTIME_NODE }
  else { $exe = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
  if (-not (Test-Path -LiteralPath $exe)) { throw 'Node.js not found; install Node 24.19.0 and pnpm 11.19.0.' }
  $fallback = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback'
  $env:PATH = (Split-Path $exe) + ';' + $fallback + ';' + $env:PATH
  & $exe (Join-Path $PSScriptRoot 'run.mjs') $Action
  exit $LASTEXITCODE
} catch { Write-Host $_.Exception.Message; exit 1 }

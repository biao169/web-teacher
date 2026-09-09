param([Parameter(Mandatory=$true)][ValidateSet('start-teacher','start-both','init-teacher','init-both')][string]$Mode)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
$basePath = Split-Path -Parent $PSScriptRoot
$settingsPath = Join-Path $basePath 'windows-oneclick.config.json'
$settings = $null
try {
    if (Test-Path -LiteralPath $settingsPath) {
        $settings = Get-Content -LiteralPath $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
    }
    function Resolve-ConfiguredPath([string]$Value) {
        if ([string]::IsNullOrWhiteSpace($Value)) { return '' }
        if ([IO.Path]::IsPathRooted($Value)) { return $Value }
        return [IO.Path]::GetFullPath((Join-Path $basePath $Value))
    }
    $runtimeRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
    $nodeCandidates = @()
    if ($env:CMS_NODE_EXE) { $nodeCandidates += $env:CMS_NODE_EXE }
    if ($settings -and $settings.nodePath) { $nodeCandidates += (Resolve-ConfiguredPath $settings.nodePath) }
    if ($env:CODEX_PRIMARY_RUNTIME_NODE) { $nodeCandidates += $env:CODEX_PRIMARY_RUNTIME_NODE }
    $nodeCandidates += (Join-Path $runtimeRoot 'node\bin\node.exe')
    $nodeCandidates += @(Get-Command node.exe -CommandType Application -All -ErrorAction SilentlyContinue | ForEach-Object { $_.Source })
    $chosenNode = $null
    foreach ($candidate in ($nodeCandidates | Select-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
        try { $versionText = & $candidate -p 'process.versions.node' 2>$null } catch { continue }
        if ($LASTEXITCODE -ne 0) { continue }
        if ($versionText -match '^24\.(\d+)\.(\d+)$' -and [int]$Matches[1] -ge 19) {
            $chosenNode = $candidate
            break
        }
    }
    if (-not $chosenNode) {
        throw '未找到兼容的 Node.js。请安装 Node.js 24.19.0，或在 windows-oneclick.config.json 的 nodePath 填写 node.exe 完整路径，然后重新双击。'
    }
    $env:PATH = (Split-Path -Parent $chosenNode) + ';' + $env:PATH
    $pnpmCandidates = @()
    if ($env:CMS_PNPM_EXE) { $pnpmCandidates += $env:CMS_PNPM_EXE }
    if ($settings -and $settings.pnpmPath) { $pnpmCandidates += (Resolve-ConfiguredPath $settings.pnpmPath) }
    $pnpmCandidates += (Join-Path $runtimeRoot 'bin\fallback\pnpm.cmd')
    $pnpmCandidates += @(Get-Command pnpm.cmd,pnpm.exe -CommandType Application -All -ErrorAction SilentlyContinue | ForEach-Object { $_.Source })
    $env:ONECLICK_PNPM_EXE = ''
    $env:ONECLICK_PNPM_COREPACK = 'false'
    foreach ($candidate in ($pnpmCandidates | Select-Object -Unique)) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { $env:ONECLICK_PNPM_EXE = $candidate; break }
    }
    if (-not $env:ONECLICK_PNPM_EXE) {
        $corepack = Get-Command corepack.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($corepack) { $env:ONECLICK_PNPM_EXE = $corepack.Source; $env:ONECLICK_PNPM_COREPACK = 'true' }
    }
    $pythonCandidates = @()
    if ($settings -and $settings.pythonPath) { $pythonCandidates += (Resolve-ConfiguredPath $settings.pythonPath) }
    $pythonCandidates += 'D:\Python\Miniconda\envs\py312\python.exe'
    foreach ($candidate in $pythonCandidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { $env:PYTHON = $candidate; $env:npm_config_python = $candidate; break }
    }
    Write-Host ('Node.js: ' + $chosenNode)
    Write-Host '首次依赖安装需要联网；已有依赖会复用。'
    $scriptFile = Join-Path $PSScriptRoot 'launcher.mjs'
    & $chosenNode $scriptFile $Mode $basePath
    exit $LASTEXITCODE
} catch {
    Write-Host ('[失败] ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}

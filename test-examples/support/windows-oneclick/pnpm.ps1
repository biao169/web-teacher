$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
try {
    $pnpmExecutable = $env:ONECLICK_PNPM_EXE
    if (-not $pnpmExecutable -or -not (Test-Path -LiteralPath $pnpmExecutable -PathType Leaf)) {
        throw '未找到 pnpm。请安装 pnpm 11.19.0，或在配置文件 pnpmPath 中填写 pnpm.cmd 完整路径。'
    }
    switch ($env:ONECLICK_PNPM_OPERATION) {
        'version' {
            $nativeArgs = @('--version')
        }
        'install' {
            # 与教师网站原 initialize_windows.bat 保持一致。
            $nativeArgs = @('install', '--frozen-lockfile', '--ignore-scripts')
        }
        default {
            throw '不支持的依赖操作。'
        }
    }
    if ($env:ONECLICK_PNPM_COREPACK -eq 'true') { $nativeArgs = @('pnpm') + $nativeArgs }
    & $pnpmExecutable @nativeArgs
    exit $LASTEXITCODE
} catch {
    [Console]::Error.WriteLine('[依赖失败] ' + $_.Exception.Message)
    exit 1
}

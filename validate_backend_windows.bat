@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "ROOT=%~dp0"
cd /d "%ROOT%"
set "CODEX_RUNTIME_ROOT=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies"
set "CODEX_NODE_DIR=%CODEX_RUNTIME_ROOT%\node\bin"
set "CODEX_PNPM_DIR=%CODEX_RUNTIME_ROOT%\bin\fallback"
set "PYTHON_EXE=D:\Python\Miniconda\envs\py312\python.exe"

if exist "%CODEX_NODE_DIR%\node.exe" set "PATH=%CODEX_NODE_DIR%;%PATH%"
if exist "%CODEX_PNPM_DIR%\pnpm.cmd" set "PATH=%CODEX_PNPM_DIR%;%PATH%"
if exist "%PYTHON_EXE%" (
  set "PYTHON=%PYTHON_EXE%"
  set "npm_config_python=%PYTHON_EXE%"
)

echo ============================================================
echo Academic CMS - 后台完整功能本地验收
echo ============================================================

where node >nul 2>nul || goto :NO_NODE
where pnpm >nul 2>nul || goto :NO_PNPM

for /f "delims=" %%V in ('node -p "process.versions.node"') do set "NODE_VERSION=%%V"
for /f "delims=" %%V in ('call pnpm --version') do set "PNPM_VERSION=%%V"
echo Node: %NODE_VERSION%
echo pnpm: %PNPM_VERSION%
if exist "%PYTHON_EXE%" (
  "%PYTHON_EXE%" --version
) else (
  echo Python: NOT FOUND at %PYTHON_EXE%
)

node -e "const v=process.versions.node.split('.').map(Number);process.exit(v[0]===24&&v[1]>=19?0:1)"
if errorlevel 1 goto :BAD_NODE
node -e "const v=process.argv[1].split('.').map(Number);process.exit(v[0]===11&&v[1]>=19?0:1)" "%PNPM_VERSION%"
if errorlevel 1 goto :BAD_PNPM

echo.
echo [1/5] 安装/校验依赖...
call pnpm install --frozen-lockfile --ignore-scripts
if errorlevel 1 goto :FAILED
call pnpm exec nuxt prepare
if errorlevel 1 goto :FAILED
node -e "const D=require('better-sqlite3');const d=new D(':memory:');d.close()"
if errorlevel 1 goto :FAILED

echo.
echo [2/5] 后台零漏项测试...
call pnpm run test:backend:zero-gap
if errorlevel 1 goto :FAILED

echo.
echo [3/5] Nuxt 类型检查...
call pnpm exec nuxt typecheck
if errorlevel 1 goto :FAILED

echo.
echo [4/5] SQLite 迁移...
call pnpm run db:migrate:sqlite
if errorlevel 1 goto :FAILED

echo.
echo [5/5] Ubuntu 生产构建...
call pnpm run build:ubuntu
if errorlevel 1 goto :FAILED

echo.
echo [PASS] 后台源码、类型、迁移和生产构建均已通过。
echo        浏览器启动后请访问 /admin/system-check 完成逐模块操作验收。
pause
exit /b 0

:NO_NODE
echo [ERROR] 未找到 Node.js。已检查 Codex 内置路径和 Windows PATH。
echo         项目要求 Node.js ^>=24.19.0 ^<25。
goto :FAILED
:NO_PNPM
echo [ERROR] 未找到 pnpm。已检查 Codex 内置路径和 Windows PATH。
echo         项目要求 pnpm ^>=11.19.0 ^<12。
goto :FAILED
:BAD_NODE
echo [ERROR] Node.js %NODE_VERSION% 不兼容，要求 ^>=24.19.0 ^<25。
goto :FAILED
:BAD_PNPM
echo [ERROR] pnpm %PNPM_VERSION% 不兼容，要求 ^>=11.19.0 ^<12。
goto :FAILED
:FAILED
echo.
echo [FAIL] 验收未通过，请根据上方第一处错误修复。
pause
exit /b 1

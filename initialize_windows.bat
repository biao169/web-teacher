@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul

set "ROOT=%~dp0"
cd /d "%ROOT%"

set "PYTHON_EXE=D:\Python\Miniconda\envs\py312\python.exe"
set "CODEX_RUNTIME_ROOT=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies"
set "NODE_EXE=%CODEX_RUNTIME_ROOT%\node\bin\node.exe"
set "PNPM_EXE=%CODEX_RUNTIME_ROOT%\bin\fallback\pnpm.cmd"
set "CMS_DATABASE_PATH=data\local-demo.sqlite3"

echo.
echo ============================================================
echo   Academic CMS - Windows 一键完整初始化
echo ============================================================
echo Project : %ROOT%
echo Database: %CMS_DATABASE_PATH%
echo Python  : %PYTHON_EXE%
echo.

rem 初始化会替换本地演示库，因此要求开发服务器已经停止。
netstat -ano | findstr /R /C:":8005 .*LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo [ERROR] 端口 8005 正在使用。请先关闭当前网站终端，再重新运行本脚本。
  goto :FAIL
)

if not exist "package.json" (
  echo [ERROR] 当前目录没有 package.json。请把脚本放在项目根目录。
  goto :FAIL
)
if not exist "%NODE_EXE%" (
  echo [ERROR] 未找到 Codex Node.js：%NODE_EXE%
  goto :FAIL
)
if not exist "%PNPM_EXE%" (
  echo [ERROR] 未找到 Codex pnpm：%PNPM_EXE%
  goto :FAIL
)
if not exist "%PYTHON_EXE%" (
  echo [ERROR] 未找到指定的 Python：%PYTHON_EXE%
  echo         请确认 Miniconda 的 py312 环境仍位于该路径。
  goto :FAIL
)

for %%P in ("%NODE_EXE%") do set "PATH=%%~dpP;%PATH%"
for %%P in ("%PNPM_EXE%") do set "PATH=%%~dpP;%PATH%"
set "PYTHON=%PYTHON_EXE%"
set "npm_config_python=%PYTHON_EXE%"

for /f "delims=" %%V in ('"%NODE_EXE%" -p "process.versions.node"') do set "NODE_VERSION=%%V"
for /f "delims=" %%V in ('call "%PNPM_EXE%" --version') do set "PNPM_VERSION=%%V"
for /f "tokens=2" %%V in ('"%PYTHON_EXE%" --version 2^>^&1') do set "PYTHON_VERSION=%%V"

echo Node.js : %NODE_VERSION%
echo pnpm    : %PNPM_VERSION%
echo Python  : %PYTHON_VERSION%

"%NODE_EXE%" -e "const v=process.versions.node.split('.').map(Number);process.exit(v[0]===24&&v[1]>=19?0:1)"
if errorlevel 1 (
  echo [ERROR] Node.js 版本不兼容，要求 ^>=24.19.0 ^<25。
  goto :FAIL
)
"%NODE_EXE%" -e "const v=process.argv[1].split('.').map(Number);process.exit(v[0]===11&&v[1]>=19?0:1)" "%PNPM_VERSION%"
if errorlevel 1 (
  echo [ERROR] pnpm 版本不兼容，要求 ^>=11.19.0 ^<12。
  goto :FAIL
)
"%PYTHON_EXE%" -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)"
if errorlevel 1 (
  echo [ERROR] Python 版本不兼容，要求 Python ^>=3.12。
  goto :FAIL
)

echo.
echo [1/5] 安装项目依赖（使用随包预编译二进制，避免重复编译 SQLite）...
call "%PNPM_EXE%" install --frozen-lockfile --ignore-scripts
if errorlevel 1 goto :FAIL

echo.
echo [2/5] 准备 Nuxt 运行文件...
call "%PNPM_EXE%" exec nuxt prepare
if errorlevel 1 goto :FAIL

echo.
echo [3/5] 检查 Windows SQLite 原生驱动...
"%NODE_EXE%" -e "const D=require('better-sqlite3');const d=new D(':memory:');d.prepare('select 1').get();d.close();console.log('[OK] better-sqlite3 win32-x64 is ready.')"
if errorlevel 1 (
  echo [ERROR] better-sqlite3 无法加载。不要继续初始化数据库。
  goto :FAIL
)

echo.
echo [4/5] 备份旧演示库、执行全部迁移并写入全表示例数据...
"%NODE_EXE%" --import tsx scripts\windows\initialize-local-demo.ts
if errorlevel 1 goto :FAIL

echo.
echo [5/5] 初始化完成。
echo ============================================================
echo 登录地址: http://127.0.0.1:8005/zh/login
echo 登录账号: demo_admin
echo 登录密码: 请查看 data\local-demo-login.txt
echo 数据库  : data\local-demo.sqlite3
echo ============================================================
echo.
echo 旧演示数据库如存在，已经保存到 data\backups。
echo 即将启动网站；按 Ctrl+C 可以停止服务器。
echo.

call start_windows.bat
exit /b %ERRORLEVEL%

:FAIL
echo.
echo [FAIL] 初始化未完成。数据库不会在失败后冒充“准备就绪”。
pause
exit /b 1

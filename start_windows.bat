@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul

rem ============================================================
rem Academic CMS - Windows 一键开发启动脚本
rem 放在项目根目录（与 package.json 同级）后双击运行。
rem
rem 当前项目要求：
rem   Node.js >= 24.19.0 < 25
rem   pnpm    >= 11.19.0 < 12
rem
rem 可按需修改下面 5 个配置。
rem ============================================================

set "HOST=127.0.0.1"
set "PORT=8005"
set "AUTO_INSTALL=1"
set "AUTO_MIGRATE=1"
set "OPEN_BROWSER=1"

set "ROOT=%~dp0"
cd /d "%ROOT%"
set "URL=http://%HOST%:%PORT%"
set "MIN_NODE_VERSION=24.19.0"
set "MIN_PNPM_VERSION=11.19.0"
set "MIN_PYTHON_VERSION=3.12"
set "PYTHON_EXE=D:\Python\Miniconda\envs\py312\python.exe"
set "CODEX_RUNTIME_ROOT=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies"
set "CODEX_NODE_CANDIDATE=%CODEX_RUNTIME_ROOT%\node\bin\node.exe"
set "CODEX_PNPM_CANDIDATE=%CODEX_RUNTIME_ROOT%\bin\fallback\pnpm.cmd"

rem SQLite 数据库优先使用当前终端变量，其次读取 .env，最后使用正式空库。
if not defined CMS_DATABASE_PATH if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%A in (`findstr /B /C:"CMS_DATABASE_PATH=" ".env" 2^>nul`) do if /I "%%A"=="CMS_DATABASE_PATH" set "CMS_DATABASE_PATH=%%B"
)
if not defined CMS_DATABASE_PATH set "CMS_DATABASE_PATH=data\site.sqlite3"

rem 固定本机 Python 3.12，供确实需要 node-gyp 的原生依赖使用。
if exist "%PYTHON_EXE%" (
  set "PYTHON=%PYTHON_EXE%"
  set "npm_config_python=%PYTHON_EXE%"
)

rem 本地开发时强制使用当前启动地址，避免 .env 中旧端口导致 Origin/SEO 不一致。
rem 同时覆盖 Windows/终端可能遗留的 NODE_ENV=production；否则认证层会拒绝
rem http://127.0.0.1 这个本地 Origin，导致后台数据接口统一返回 AUTH_CONFIG/500。
set "NODE_ENV=development"
set "NUXT_AUTH_TRUSTED_ORIGINS=%URL%"
set "NUXT_AUTH_SECURE_COOKIES=false"
set "NUXT_PUBLIC_SITE_URL=%URL%"
set "NUXT_CACHE_ORIGIN=%URL%"

echo.
echo ============================================================
echo   Academic CMS - Windows Development Server
echo ============================================================
echo Project : %ROOT%
echo URL     : %URL%
echo Database: %CMS_DATABASE_PATH%
echo Required: Node.js ^>= %MIN_NODE_VERSION% and ^< 25; pnpm ^>= %MIN_PNPM_VERSION% and ^< 12
echo Python : %PYTHON_EXE% ^(native build fallback^)
echo.

rem ------------------------------------------------------------
rem 1. 检查项目目录
rem ------------------------------------------------------------
if not exist "package.json" (
  echo [ERROR] package.json was not found.
  echo         Please put this .bat file in the project root directory.
  goto :FAIL
)

rem ------------------------------------------------------------
rem 2. 自动发现 Node.js 与 pnpm
rem    优先使用 Codex 内置运行时；找不到时再检查 PATH / Corepack。
rem ------------------------------------------------------------
set "NODE_EXE="
set "NODE_SOURCE="
set "NODE_VERSION="
set "PNPM_EXE="
set "PNPM_CMD="
set "PNPM_PREFIX="
set "PNPM_SOURCE="
set "PNPM_VERSION="
set "PYTHON_VERSION="
set "ENVIRONMENT_ERROR=0"

if defined CMS_NODE_EXE if exist "%CMS_NODE_EXE%" (
  set "NODE_EXE=%CMS_NODE_EXE%"
  set "NODE_SOURCE=CMS_NODE_EXE override"
)
if not defined NODE_EXE if exist "%CODEX_NODE_CANDIDATE%" (
  set "NODE_EXE=%CODEX_NODE_CANDIDATE%"
  set "NODE_SOURCE=Codex built-in runtime"
)
if not defined NODE_EXE (
  for /f "delims=" %%P in ('where node.exe 2^>nul') do if not defined NODE_EXE (
    set "NODE_EXE=%%P"
    set "NODE_SOURCE=Windows PATH"
  )
)

if defined NODE_EXE (
  for %%P in ("%NODE_EXE%") do set "PATH=%%~dpP;%PATH%"
  for /f "delims=" %%V in ('node.exe -p "process.versions.node" 2^>nul') do set "NODE_VERSION=%%V"
)

if defined CMS_PNPM_EXE if exist "%CMS_PNPM_EXE%" (
  set "PNPM_EXE=%CMS_PNPM_EXE%"
  set "PNPM_CMD=pnpm.cmd"
  set "PNPM_SOURCE=CMS_PNPM_EXE override"
)
if not defined PNPM_EXE if exist "%CODEX_PNPM_CANDIDATE%" (
  set "PNPM_EXE=%CODEX_PNPM_CANDIDATE%"
  set "PNPM_CMD=pnpm.cmd"
  set "PNPM_SOURCE=Codex built-in runtime"
)
if not defined PNPM_EXE (
  for /f "delims=" %%P in ('where pnpm.cmd 2^>nul') do if not defined PNPM_EXE (
    set "PNPM_EXE=%%P"
    set "PNPM_CMD=pnpm.cmd"
    set "PNPM_SOURCE=Windows PATH"
  )
)
if not defined PNPM_EXE (
  for /f "delims=" %%P in ('where corepack.cmd 2^>nul') do if not defined PNPM_EXE (
    set "PNPM_EXE=%%P"
    set "PNPM_CMD=corepack.cmd"
    set "PNPM_PREFIX=pnpm"
    set "PNPM_SOURCE=Corepack"
  )
)

if defined PNPM_EXE (
  for %%P in ("%PNPM_EXE%") do set "PATH=%%~dpP;%PATH%"
  for /f "delims=" %%V in ('call %PNPM_CMD% %PNPM_PREFIX% --version 2^>nul') do set "PNPM_VERSION=%%V"
)

if exist "%PYTHON_EXE%" (
  for /f "tokens=2" %%V in ('"%PYTHON_EXE%" --version 2^>^&1') do set "PYTHON_VERSION=%%V"
)

echo ============================================================
echo Environment detection result
echo ============================================================
if defined NODE_EXE (
  echo Node.js : %NODE_VERSION%
  echo Node exe: %NODE_EXE%
  echo Source  : %NODE_SOURCE%
) else (
  echo Node.js : NOT FOUND
)
echo.
if defined PNPM_EXE (
  echo pnpm    : %PNPM_VERSION%
  echo pnpm exe: %PNPM_EXE%
  echo Source  : %PNPM_SOURCE%
) else (
  echo pnpm    : NOT FOUND
)
echo.
if defined PYTHON_VERSION (
  echo Python  : %PYTHON_VERSION%
  echo Python exe: %PYTHON_EXE%
  echo Source  : fixed Miniconda py312 environment
) else (
  echo Python  : NOT FOUND at %PYTHON_EXE%
  echo Source  : optional native build fallback
)
echo.

rem ------------------------------------------------------------
rem 3. 校验检测结果并明确列出缺失或不兼容项
rem ------------------------------------------------------------
if not defined NODE_EXE (
  echo [MISSING] Node.js executable was not found.
  echo           Checked Codex: %CODEX_NODE_CANDIDATE%
  echo           Also checked: Windows PATH
  set "ENVIRONMENT_ERROR=1"
) else if not defined NODE_VERSION (
  echo [BROKEN] Node.js was found but could not be started: %NODE_EXE%
  set "ENVIRONMENT_ERROR=1"
) else (
  "%NODE_EXE%" -e "const v=process.versions.node.split('.').map(Number);process.exit(v[0]===24&&v[1]>=19?0:1)"
  if errorlevel 1 (
    echo [INCOMPATIBLE] Node.js %NODE_VERSION%
    echo                Required: Node.js ^>=24.19.0 ^<25
    set "ENVIRONMENT_ERROR=1"
  ) else (
    echo [OK] Node.js %NODE_VERSION% meets the requirement.
  )
)

if not defined PNPM_EXE (
  echo [MISSING] pnpm and Corepack were not found.
  echo           Checked Codex: %CODEX_PNPM_CANDIDATE%
  echo           Also checked: Windows PATH and Corepack
  set "ENVIRONMENT_ERROR=1"
) else if not defined PNPM_VERSION (
  echo [BROKEN] pnpm was found but could not be started: %PNPM_EXE%
  set "ENVIRONMENT_ERROR=1"
) else if not defined NODE_EXE (
  echo [BLOCKED] pnpm version cannot be validated until Node.js is available.
  set "ENVIRONMENT_ERROR=1"
) else (
  "%NODE_EXE%" -e "const v=process.argv[1].split('.').map(Number);process.exit(v[0]===11&&v[1]>=19?0:1)" "%PNPM_VERSION%"
  if errorlevel 1 (
    echo [INCOMPATIBLE] pnpm %PNPM_VERSION%
    echo                Required: pnpm ^>=11.19.0 ^<12
    set "ENVIRONMENT_ERROR=1"
  ) else (
    echo [OK] pnpm %PNPM_VERSION% meets the requirement.
  )
)

if "%ENVIRONMENT_ERROR%"=="1" (
  echo.
  echo [BLOCKED] Missing or incompatible tools are listed above.
  goto :FAIL
)

echo [READY] Required tools are complete. Nothing is missing.
if defined PYTHON_VERSION (
  "%PYTHON_EXE%" -c "import sys; raise SystemExit(0 if sys.version_info ^>= (3, 12) else 1)"
  if errorlevel 1 (
    echo [WARN] Python %PYTHON_VERSION% is older than %MIN_PYTHON_VERSION%; prebuilt dependencies will still be preferred.
  ) else (
    echo [OK] Python %PYTHON_VERSION% is ready for native build fallback.
  )
) else (
  echo [WARN] Python fallback is unavailable. This does not block packaged prebuilt Windows dependencies.
)

rem ------------------------------------------------------------
rem 4. 初始化本地 .env
rem    - 不覆盖已有非空密钥
rem    - 首次运行只生成开发环境随机密钥
rem ------------------------------------------------------------
if not exist ".env" (
  if exist ".env.example" (
    copy /y ".env.example" ".env" >nul
    echo [INIT] Created .env from .env.example
  ) else (
    >".env" echo CMS_DATABASE_PATH=data/site.sqlite3
    >>".env" echo NUXT_AUTH_SECRET=
    >>".env" echo NUXT_AUTH_BOOTSTRAP_TOKEN=
    >>".env" echo NUXT_MEDIA_GRANT_SECRET=
    echo [INIT] Created a minimal .env
  )
)

"%NODE_EXE%" -e "const fs=require('node:fs'),c=require('node:crypto');const p='.env';let s=fs.readFileSync(p,'utf8');for(const k of ['NUXT_AUTH_SECRET','NUXT_AUTH_BOOTSTRAP_TOKEN','NUXT_MEDIA_GRANT_SECRET']){const r=new RegExp('^'+k+'=(.*)$','m');const m=s.match(r);const v=c.randomBytes(48).toString('base64url');if(!m){s+=(s.endsWith('\n')?'':'\n')+k+'='+v+'\n'}else if(!m[1].trim()){s=s.replace(r,k+'='+v)}}fs.writeFileSync(p,s,'utf8')"
if errorlevel 1 (
  echo [ERROR] Failed to initialize .env secrets.
  goto :FAIL
)

echo [OK] Local environment file is ready.

rem ------------------------------------------------------------
rem 5. 首次运行自动安装依赖
rem ------------------------------------------------------------
if not exist "node_modules\.bin\nuxt.cmd" (
  if not "%AUTO_INSTALL%"=="1" (
    echo [ERROR] Project dependencies are not installed.
    echo         Run: %PNPM_CMD% %PNPM_PREFIX% install
    goto :FAIL
  )

  echo.
  echo [INIT] Installing project dependencies...
  echo        This may require Internet access on the first run.
  rem better-sqlite3 already ships a win32-x64 binary. Skipping lifecycle scripts
  rem avoids an unnecessary node-gyp rebuild; Nuxt preparation is run explicitly.
  call %PNPM_CMD% %PNPM_PREFIX% install --frozen-lockfile --ignore-scripts
  if errorlevel 1 (
    echo.
    echo [ERROR] Dependency installation failed.
    echo         Check npm registry/network access and then run this script again.
    goto :FAIL
  )
  call %PNPM_CMD% %PNPM_PREFIX% exec nuxt prepare
  if errorlevel 1 (
    echo.
    echo [ERROR] Nuxt preparation failed after dependency installation.
    goto :FAIL
  )
  "%NODE_EXE%" -e "const D=require('better-sqlite3');const d=new D(':memory:');d.prepare('select 1').get();d.close()"
  if errorlevel 1 (
    echo.
    echo [ERROR] The packaged better-sqlite3 Windows binary could not be loaded.
    echo         Python fallback: %PYTHON_EXE%
    goto :FAIL
  )
)

echo [OK] Project dependencies are ready.

rem ------------------------------------------------------------
rem 6. 幂等执行 SQLite migration
rem    migrate 工具会对已有数据库先做备份，并执行完整性检查。
rem ------------------------------------------------------------
if "%AUTO_MIGRATE%"=="1" (
  echo.
  echo [DB] Checking/applying SQLite migrations...
  call %PNPM_CMD% %PNPM_PREFIX% run db:migrate:sqlite
  if errorlevel 1 (
    echo.
    echo [ERROR] Database migration failed.
    echo         Database: %CMS_DATABASE_PATH%
    goto :FAIL
  )
  echo [OK] Database migration completed.
)

rem ------------------------------------------------------------
rem 7. 防止端口冲突
rem ------------------------------------------------------------
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo.
  echo [ERROR] Port %PORT% is already in use.
  echo         Stop the existing process or edit PORT at the top of this script.
  goto :FAIL
)

rem Clear generated Nuxt state only after the port-conflict check.
"%NODE_EXE%" scripts\windows\prepare-development.mjs
if errorlevel 1 (
  echo [ERROR] Could not prepare a clean development build.
  goto :FAIL
)

rem ------------------------------------------------------------
rem 8. 服务真正可访问后再打开浏览器
rem ------------------------------------------------------------
if "%OPEN_BROWSER%"=="1" (
  start "" /min powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$u='%URL%'; for($i=0; $i -lt 120; $i++){ try { $r=Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 1; if($r.StatusCode -ge 200 -and $r.StatusCode -lt 500){ Start-Process $u; exit 0 } } catch {}; Start-Sleep -Milliseconds 500 }"
)

echo.
echo ============================================================
echo Starting Academic CMS...
echo URL: %URL%
echo.
echo Press Ctrl+C to stop the development server.
echo ============================================================
echo.

rem 直接调用 Nuxt，避免不同 pnpm run 参数转发行为产生差异。
call %PNPM_CMD% %PNPM_PREFIX% exec nuxt dev --host %HOST% --port %PORT%
set "SERVER_EXIT=%ERRORLEVEL%"

echo.
if "%SERVER_EXIT%"=="0" (
  echo Website server stopped.
) else (
  echo [ERROR] Website server exited with code %SERVER_EXIT%.
)

pause
exit /b %SERVER_EXIT%

:FAIL
echo.
echo Startup aborted.
pause
exit /b 1

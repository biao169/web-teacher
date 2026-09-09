@echo off
setlocal
cd /d "%~dp0.."
call pnpm install --frozen-lockfile
if errorlevel 1 goto failed
call pnpm build
if errorlevel 1 goto failed
call pnpm test
if errorlevel 1 goto failed
call pnpm check:cloudflare
if errorlevel 1 goto failed
node test-examples/runtime-smoke.mjs
if errorlevel 1 goto failed
echo [OK] All checks passed.
pause
exit /b 0
:failed
echo [FAILED] Read the error above.
pause
exit /b 1

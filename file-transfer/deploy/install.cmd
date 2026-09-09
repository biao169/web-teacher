@echo off
setlocal
pushd "%~dp0.."
call pnpm install --frozen-lockfile
set "FT_INSTALL_EXIT=%ERRORLEVEL%"
popd
if not "%FT_INSTALL_EXIT%"=="0" echo Install failed. Check Node.js 24.19.0, pnpm 11.19.0 and network access.
pause
exit /b %FT_INSTALL_EXIT%

@echo off
chcp 65001 >nul
setlocal
node "%~dp0..\scripts\initialize-bridge.mjs"
set "FT_RUN_EXIT=%ERRORLEVEL%"
pause
exit /b %FT_RUN_EXIT%

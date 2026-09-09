@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" production-build
set "RESULT=%ERRORLEVEL%"
pause
exit /b %RESULT%

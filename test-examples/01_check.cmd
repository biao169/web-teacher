@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" check
set "RESULT=%ERRORLEVEL%"
pause
exit /b %RESULT%

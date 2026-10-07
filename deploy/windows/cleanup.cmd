@echo off
rem Preview by default. Interpreter and storage settings are read from local.cmd.
set "CLEANUP_MODE=%~1"
if "%CLEANUP_MODE%"=="" set "CLEANUP_MODE=cleanup-preview"
if "%CLEANUP_MODE%"=="cleanup-preview" goto run
if "%CLEANUP_MODE%"=="cleanup-run" goto run
if "%CLEANUP_MODE%"=="cleanup-status" goto run
echo Use cleanup-preview, cleanup-run or cleanup-status.
exit /b 1
:run
call "%~dp0launch.cmd" %CLEANUP_MODE%
exit /b %errorlevel%

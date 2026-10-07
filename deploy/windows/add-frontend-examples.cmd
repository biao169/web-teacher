@echo off
rem Add the existing 30-student / 100-paper batch; requires development admin login.
rem Interpreter and paths are configured in local.cmd; see README.md.
call "%~dp0launch.cmd" frontend-examples --profile demo %*
exit /b %errorlevel%

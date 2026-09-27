@echo off
rem Development: continue the existing test database without rebuilding.
rem Interpreter and paths are configured in local.cmd; see README.md.
call "%~dp0launch.cmd" start --profile demo %*
exit /b %errorlevel%

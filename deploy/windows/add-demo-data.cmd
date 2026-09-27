@echo off
rem Add standard examples to the configured website database without rebuilding.
rem Interpreter and paths are configured in local.cmd; see README.md.
call "%~dp0launch.cmd" seed --profile demo %*
exit /b %errorlevel%

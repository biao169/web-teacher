@echo off
rem Rebuild only the dedicated test database and seed examples; do not start.
rem Interpreter and paths are configured in local.cmd; see README.md.
call "%~dp0launch.cmd" rebuild --profile demo %*
exit /b %errorlevel%

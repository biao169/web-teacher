@echo off
rem Development: rebuild the dedicated test database, seed examples, then start.
rem Interpreter and paths are configured in local.cmd; see README.md.
call "%~dp0launch.cmd" fresh --profile demo %*
exit /b %errorlevel%

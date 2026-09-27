@echo off
rem Run isolated Python regression tests. Add --dom for optional Node/jsdom tests.
rem Interpreter and paths are configured in local.cmd; see README.md.
call "%~dp0launch.cmd" test %*
exit /b %errorlevel%

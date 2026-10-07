@echo off
rem Use normal TEACHER_CONFIG / storage paths. Never rebuild on startup.
rem Interpreter and paths are configured in local.cmd; see README.md.
call "%~dp0launch.cmd" start --profile normal %*
exit /b %errorlevel%

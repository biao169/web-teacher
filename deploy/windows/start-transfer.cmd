@echo off
rem Compatibility entry: transfer now shares the teacher-site service.
call "%~dp0start-normal.cmd" %*
exit /b %errorlevel%

@echo off
setlocal DisableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0\..\.."
set "PYTHONUTF8=1"
rem Optional machine-only configuration. Never commit local.cmd or passwords.
if exist "%~dp0local.cmd" call "%~dp0local.cmd"
rem Priority: explicit executable, custom venv, project venv, Python launcher, PATH.
if defined TEACHER_PYTHON goto configured
if defined TEACHER_VENV if exist "%TEACHER_VENV%\Scripts\python.exe" goto customvenv
if exist ".venv\Scripts\python.exe" goto localvenv
py -3 -c "import sys;sys.exit(sys.version_info < (3,12))" >nul 2>nul
if not errorlevel 1 goto pylauncher
python -c "import sys;sys.exit(sys.version_info < (3,12))" >nul 2>nul
if not errorlevel 1 goto python
echo Python 3.12+ is required. Configure TEACHER_PYTHON in deploy\windows\local.cmd.
set "RESULT=1"
goto finish
:configured
"%TEACHER_PYTHON%" deploy\shared\launcher.py %*
goto done
:customvenv
"%TEACHER_VENV%\Scripts\python.exe" deploy\shared\launcher.py %*
goto done
:localvenv
".venv\Scripts\python.exe" deploy\shared\launcher.py %*
goto done
:pylauncher
py -3 deploy\shared\launcher.py %*
goto done
:python
python deploy\shared\launcher.py %*
:done
set "RESULT=%errorlevel%"
:finish
if not "%RESULT%"=="0" echo Operation failed. Read the error above.
rem Set TEACHER_NO_PAUSE=1 for CI / automated tests.
if not "%TEACHER_NO_PAUSE%"=="1" pause
exit /b %RESULT%

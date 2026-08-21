@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

set "HOST=127.0.0.1"
set "PORT=8003"
set "URL=http://%HOST%:%PORT%"
set "PYTHONUTF8=1"

if exist "D:\Python\Miniconda\envs\py312\python.exe" (
  set "PYTHON_CMD="D:\Python\Miniconda\envs\py312\python.exe""
) else (
  where py >nul 2>nul
  if not errorlevel 1 (
    set "PYTHON_CMD=py -3"
  ) else (
    where python >nul 2>nul
    if errorlevel 1 (
      echo [ERROR] Python was not found. Please install Python 3.11+ or edit this script.
      pause
      exit /b 1
    )
    set "PYTHON_CMD=python"
  )
)

echo Starting teacher site...
echo Project: %ROOT%
echo URL:     %URL%
echo Python:  %PYTHON_CMD%
echo.

start "" /min powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 2; Start-Process '%URL%'"
%PYTHON_CMD% -m tools.dev_server --host %HOST% --port %PORT%

echo.
echo Website server stopped.
pause

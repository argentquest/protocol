@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-development.ps1"
if errorlevel 1 (
  echo.
  echo Path Protocol did not start. Review the message above.
  pause
)
endlocal

@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
set "GURACH_INSTALL_EXIT=%ERRORLEVEL%"
if not "%GURACH_INSTALL_EXIT%"=="0" pause
exit /b %GURACH_INSTALL_EXIT%

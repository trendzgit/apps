@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
  start "Outback Haul server" /min cmd /c "py -3 -m http.server 8000 --bind 127.0.0.1"
  goto :open
)

where python >nul 2>nul
if %errorlevel%==0 (
  start "Outback Haul server" /min cmd /c "python -m http.server 8000 --bind 127.0.0.1"
  goto :open
)

echo Python 3 was not found. Install Python 3, then run this file again.
pause
exit /b 1

:open
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8000/index.html"
echo The local game server is running in a separate window.
echo Close that server window when you finish playing.

@echo off
cd /d "%~dp0"

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set TODAY=%%i

if exist ".session-refresh-marker" (
  set /p LASTDATE=<".session-refresh-marker"
  if "%LASTDATE%"=="%TODAY%" (
    echo 오늘 이미 세션 갱신 완료됨. 건너뜀.
    exit /b 0
  )
)

call session-refresh-core.bat

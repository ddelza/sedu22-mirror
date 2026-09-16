@echo off
cd /d "%~dp0"

node capture-session.js
if errorlevel 1 (
  echo 세션 캡처 실패 또는 시간 초과.
  exit /b 1
)

node upload-secret.js
if errorlevel 1 (
  echo 세션 업로드 실패.
  exit /b 1
)

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set TODAY=%%i
> ".session-refresh-marker" echo %TODAY%
echo 세션 갱신 완료 (%TODAY%)
exit /b 0

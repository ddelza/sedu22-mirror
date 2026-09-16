@echo off
cd /d "%~dp0"
echo 브라우저 창이 뜨면 정회원 계정으로 로그인해주세요.
echo 로그인이 완료되면 세션 저장과 GitHub Secret 업로드까지 자동으로 진행됩니다.
echo.
call session-refresh-core.bat
echo.
echo 완료. 창을 닫으셔도 됩니다.
pause

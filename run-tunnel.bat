@echo off
title REELIX Studio - Public Ngrok Tunnel
cd /d "%~dp0"
echo ===================================================
echo   Starting Ngrok HTTPS Tunnel for Port 8001
echo ===================================================
echo.
ngrok http 8001
pause

@echo off
title REELIX Studio - Master Launcher
cls
echo ================================================================
echo               REELIX STUDIO - MASTER LAUNCHER
echo ================================================================
echo.
echo [1/2] Starting Python FastAPI Backend on http://0.0.0.0:8001 ...
start "REELIX Backend API (Port 8001)" cmd /k "cd /d "%~dp0backend" && python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload"

timeout /t 3 /nobreak >nul

echo [2/2] Starting Cloudflare HTTPS Tunnel (No Warnings, Global Access) ...
echo ================================================================
echo  Your tunnel URL will appear below (look for trycloudflare.com).
echo  Enter that URL into REELIX Studio Settings on any other device!
echo ================================================================
echo.
"%~dp0cloudflared.exe" tunnel --url http://localhost:8001
pause

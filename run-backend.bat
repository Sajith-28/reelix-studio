@echo off
title REELIX Studio - FastAPI Backend Server
cd /d "%~dp0backend"
echo ===================================================
echo   Starting REELIX Studio Backend on http://0.0.0.0:8001
echo ===================================================
echo.
python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
pause

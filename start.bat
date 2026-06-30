@echo off
echo ====================================================
echo 🚀 Launching XYZ Sales Outreach Command Center...
echo ====================================================
echo.
echo [1/2] Opening your web browser...
start http://localhost:8000
echo.
echo [2/2] Starting the local web server...
echo (Keep this window open while using the application)
echo.
python -m http.server 8000
pause

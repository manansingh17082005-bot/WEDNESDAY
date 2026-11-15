@echo off
title WEDNESDAY Local Lead Hunter
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (py -3 server.py) else (python server.py)
if errorlevel 1 (
 echo.
 echo Could not start. Install Python 3 from https://www.python.org/downloads/
 echo During setup, enable Add Python to PATH.
 pause
)

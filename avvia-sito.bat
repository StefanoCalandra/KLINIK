@echo off
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js non e installato. Scaricalo da https://nodejs.org/
  pause
  exit /b 1
)

cd /d "%~dp0"
echo Avvio di Clinica Aurora...
npm run start:open
pause

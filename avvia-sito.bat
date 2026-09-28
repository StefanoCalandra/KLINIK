@echo off
cd /d "%~dp0"

where dotnet >nul 2>nul
if not errorlevel 1 (
  echo Avvio di Clinica Aurora con ASP.NET Core...
  dotnet run --project ClinicaAurora.csproj
  pause
  exit /b %errorlevel%
)

where node >nul 2>nul
if not errorlevel 1 (
  echo .NET non trovato: avvio alternativo con Node.js...
  npm run start:open
  pause
  exit /b %errorlevel%
)

echo Installa Visual Studio 2026 con il carico di lavoro "Sviluppo ASP.NET e Web".
echo In alternativa, installa Node.js da https://nodejs.org/
pause
exit /b 1

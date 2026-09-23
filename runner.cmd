@echo off
REM Windows launcher for PaperPilot ./runner (Git Bash / WSL)
setlocal
set "SCRIPT=%~dp0runner"

where bash >nul 2>&1
if %ERRORLEVEL%==0 (
  bash "%SCRIPT%" %*
  exit /b %ERRORLEVEL%
)

if exist "%ProgramFiles%\Git\bin\bash.exe" (
  "%ProgramFiles%\Git\bin\bash.exe" "%SCRIPT%" %*
  exit /b %ERRORLEVEL%
)

if exist "%ProgramFiles(x86)%\Git\bin\bash.exe" (
  "%ProgramFiles(x86)%\Git\bin\bash.exe" "%SCRIPT%" %*
  exit /b %ERRORLEVEL%
)

where wsl >nul 2>&1
if %ERRORLEVEL%==0 (
  wsl -e bash "%SCRIPT%" %*
  exit /b %ERRORLEVEL%
)

echo.
echo [PaperPilot] Need Git Bash or WSL to run the runner TUI.
echo   Install Git for Windows: https://git-scm.com/download/win
echo   Then from this folder:
echo     bash runner
echo     runner status
echo     runner stack
echo.
exit /b 1

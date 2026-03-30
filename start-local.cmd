@echo off
set "NODE_DIR=C:\Program Files\nodejs"
set "NPM_CMD=%NODE_DIR%\npm.cmd"

if exist "%NPM_CMD%" (
  set "PATH=%NODE_DIR%;%PATH%"
  call "%NPM_CMD%" run dev
  exit /b %ERRORLEVEL%
)

echo Node.js was not found at C:\Program Files\nodejs.
echo Install Node.js LTS, then run this script again.
exit /b 1

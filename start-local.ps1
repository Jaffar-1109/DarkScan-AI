$nodeDir = 'C:\Program Files\nodejs'
$npmCmd = Join-Path $nodeDir 'npm.cmd'

if (Test-Path $npmCmd) {
  $env:Path = "$nodeDir;$env:Path"
  & $npmCmd run dev
  exit $LASTEXITCODE
}

Write-Host 'Node.js was not found at C:\Program Files\nodejs.' -ForegroundColor Red
Write-Host 'Install Node.js LTS, then run this script again.' -ForegroundColor Yellow
exit 1

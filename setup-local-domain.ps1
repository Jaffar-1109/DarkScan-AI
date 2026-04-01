$ErrorActionPreference = 'Stop'

$hostName = 'darkscan.local'
$mapping = "127.0.0.1 $hostName"
$hostsPath = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).
  IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  Write-Host "Please run this script as Administrator." -ForegroundColor Yellow
  exit 1
}

$content = Get-Content -Path $hostsPath -ErrorAction Stop
if (-not ($content -contains $mapping)) {
  Add-Content -Path $hostsPath -Value $mapping
  Write-Host "Added hosts entry: $mapping" -ForegroundColor Green
} else {
  Write-Host "Hosts entry already exists: $mapping" -ForegroundColor Cyan
}

ipconfig /flushdns | Out-Null
Write-Host "DNS cache flushed." -ForegroundColor Green
Write-Host "Open http://$hostName:3000 after starting the app." -ForegroundColor Green

param(
  [string]$BackendUrl = $env:APP_URL,
  [string]$OutputDir = "browser-extension\dist"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceDir = Join-Path $projectRoot "browser-extension"

if (-not (Test-Path -LiteralPath $sourceDir)) {
  throw "Browser extension source folder was not found: $sourceDir"
}

if ([string]::IsNullOrWhiteSpace($BackendUrl)) {
  $BackendUrl = "https://your-render-service.onrender.com"
}

$BackendUrl = $BackendUrl.Trim().TrimEnd('/')
if ($BackendUrl -notmatch '^https?://') {
  throw "BackendUrl must start with http:// or https://"
}

$resolvedProjectRoot = [System.IO.Path]::GetFullPath($projectRoot)
$resolvedOutputRoot = if ([System.IO.Path]::IsPathRooted($OutputDir)) {
  [System.IO.Path]::GetFullPath($OutputDir)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $projectRoot $OutputDir))
}

if (-not $resolvedOutputRoot.StartsWith($resolvedProjectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "OutputDir must stay inside the project workspace."
}

$unpackedDir = Join-Path $resolvedOutputRoot "darkscan-ai-browser-guard"
$chromiumZipPath = Join-Path $resolvedOutputRoot "darkscan-ai-browser-guard-chromium.zip"
$firefoxPackagePath = Join-Path $resolvedOutputRoot "darkscan-ai-browser-guard-firefox.xpi"

New-Item -ItemType Directory -Path $resolvedOutputRoot -Force | Out-Null

foreach ($target in @($unpackedDir, $chromiumZipPath, $firefoxPackagePath)) {
  if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
  }
}

New-Item -ItemType Directory -Path $unpackedDir -Force | Out-Null

Get-ChildItem -Path $sourceDir -File | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $unpackedDir $_.Name)
}

$manifestPath = Join-Path $unpackedDir "manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$backendOriginPattern = ([System.Uri]$BackendUrl).GetLeftPart([System.UriPartial]::Authority) + "/*"
$manifest.host_permissions = @(
  $manifest.host_permissions
  $backendOriginPattern
) | Where-Object { $_ } | Select-Object -Unique
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

foreach ($fileName in @("background.js", "popup.js", "README.md")) {
  $filePath = Join-Path $unpackedDir $fileName
  if (Test-Path -LiteralPath $filePath) {
    $content = Get-Content -LiteralPath $filePath -Raw
    $content = $content.Replace("http://localhost:3000", $BackendUrl)
    $content = $content.Replace("http://127.0.0.1:3000", $BackendUrl)
    Set-Content -LiteralPath $filePath -Value $content -Encoding UTF8
  }
}

$deploymentNotes = @"
DarkScan AI Browser Guard Deployment Package
===========================================

Default backend URL:
$BackendUrl

Files in this folder:
- darkscan-ai-browser-guard\  -> unpacked extension folder
- darkscan-ai-browser-guard-chromium.zip -> upload to Chrome Web Store / Edge Add-ons or unzip for manual install
- darkscan-ai-browser-guard-firefox.xpi  -> Firefox-style package copy of the same extension bundle

Important:
- Browsers do not allow a website to auto-install an extension for normal users.
- Users must install the extension manually, through a browser store, or through an enterprise-managed policy.
- After install, users can still change the backend URL from the popup if needed.
"@

Set-Content -LiteralPath (Join-Path $resolvedOutputRoot "DEPLOYMENT.txt") -Value $deploymentNotes -Encoding UTF8

Compress-Archive -Path (Join-Path $unpackedDir '*') -DestinationPath $chromiumZipPath -Force
Copy-Item -LiteralPath $chromiumZipPath -Destination $firefoxPackagePath

Write-Host "Browser Guard package created successfully."
Write-Host "Backend URL: $BackendUrl"
Write-Host "Unpacked folder: $unpackedDir"
Write-Host "Chromium zip: $chromiumZipPath"
Write-Host "Firefox package: $firefoxPackagePath"

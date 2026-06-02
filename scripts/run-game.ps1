$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

if (-not (Test-Path (Join-Path $projectRoot 'package.json'))) {
  Write-Error "package.json not found at $projectRoot"
}

Write-Host 'Starting dev server (reloads the browser when you save). Press Ctrl+C to stop.' -ForegroundColor Cyan
npm run game

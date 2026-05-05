param(
  [string]$Version = "22.14.0"
)

$ErrorActionPreference = "Stop"

if (Get-Command nvm -ErrorAction SilentlyContinue) {
  Write-Host "[node] Installing Node $Version if missing..."
  nvm install $Version | Out-Host
  Write-Host "[node] Switching to Node $Version..."
  nvm use $Version | Out-Host
}
elseif (Get-Command winget -ErrorAction SilentlyContinue) {
  Write-Host "[node] nvm not found; using winget Node LTS install/upgrade..."
  winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements | Out-Host
  if ($LASTEXITCODE -ne 0) {
    winget upgrade --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements | Out-Host
  }
  Write-Warning "[node] Close this PowerShell window and open a NEW one so PATH refreshes."
}
else {
  throw "Neither nvm nor winget is available. Install Node 22 LTS manually, reopen PowerShell, and run this script again."
}

$nodeVersion = (& node -v)
Write-Host "[node] Active version: $nodeVersion"
if (-not $nodeVersion.StartsWith("v22.")) {
  throw "Expected Node v22.x after switch, got $nodeVersion. If winget just installed Node LTS, open a NEW PowerShell and run node -v again."
}

Write-Host "[node] Node 22 is active. You can now run live PGlite scripts." -ForegroundColor Green

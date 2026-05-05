# Fresh PGlite + migrate + seed + dev server on port 3101 (deterministic live harness).
# Run from repo: npm run dev:live  (cwd must be APROOF)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\live-pglite-env.ps1"
$aproofRoot = $script:AproofRootForLive
Set-Location $aproofRoot

Write-Host "[dev:live] Killing common dev ports..." -ForegroundColor Cyan
& "$PSScriptRoot\kill-repo-ports.ps1"

$dataDir = $script:AproofLivePgliteDataDir
if (Test-Path $dataDir) {
  Write-Host "[dev:live] Removing existing PGlite dir: $dataDir" -ForegroundColor Cyan
  Remove-Item -Recurse -Force $dataDir
}
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null

Set-AproofLivePgliteEnv

$env:PORT = "3101"
Remove-Item Env:\APROOF_PORT -ErrorAction SilentlyContinue

Write-Host "[dev:live] PORT=3101" -ForegroundColor Cyan

npm run db:migrate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run seed
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run seed:live
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[dev:live] Starting npm run dev (Ctrl+C to stop)..." -ForegroundColor Green
npm run dev

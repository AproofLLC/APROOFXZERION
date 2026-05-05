# Run PowerShell live harness against the dev:live server (http://localhost:3101).
# Prerequisites: another terminal running `npm run dev:live` (or same PORT/PGLITE setup).
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\live-pglite-env.ps1"
Set-AproofLivePgliteEnv

$repoRoot = Split-Path $script:AproofRootForLive -Parent
$livePs1 = Join-Path $repoRoot "scripts\live-ps1"
$runner = Join-Path $livePs1 "RUN-ALL-LIVE-TESTS.ps1"

if (-not (Test-Path $runner)) {
  Write-Error "Live harness not found: $runner"
  exit 1
}

$base = "http://127.0.0.1:3101"
$env:APROOF_URL = $base
Write-Host "[test:live] APROOF_URL=$base (must match dev:live server)" -ForegroundColor Cyan
Write-Host "[test:live] Running $runner" -ForegroundColor Cyan

& powershell -NoProfile -ExecutionPolicy Bypass -File $runner -BaseUrl $base
$code = $LASTEXITCODE
if ($code -eq 0) {
  Write-Host "[test:live] All live scripts passed." -ForegroundColor Green
} else {
  Write-Host "[test:live] Failed (exit $code)." -ForegroundColor Red
}
exit $code

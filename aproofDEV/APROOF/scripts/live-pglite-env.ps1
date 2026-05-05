# Shared PGlite directory for `npm run dev:live` + `npm run test:live` + live-ps1 harness.
# Dot-source from APROOF/scripts: . "$PSScriptRoot\live-pglite-env.ps1"
$script:AproofRootForLive = Split-Path $PSScriptRoot -Parent
if ($env:APROOF_LIVE_PGLITE_DATA_DIR -and $env:APROOF_LIVE_PGLITE_DATA_DIR.Trim().Length -gt 0) {
  $script:AproofLivePgliteDataDir = $env:APROOF_LIVE_PGLITE_DATA_DIR.Trim()
} elseif ($script:AproofRootForLive -match '[\\/]OneDrive[\\/]') {
  # On-disk PGlite + WASM often fails under OneDrive-synced trees; use a local temp dir by default.
  $script:AproofLivePgliteDataDir = Join-Path $env:TEMP "aproof-live-test-run-fresh"
} else {
  $script:AproofLivePgliteDataDir = Join-Path $script:AproofRootForLive "data\live-test-run-fresh"
}

function Set-AproofLivePgliteEnv {
  $env:APROOF_DB_MODE = "pglite"
  $env:PGLITE_DATA_DIR = $script:AproofLivePgliteDataDir
  $env:APROOF_PGLITE_DATA_DIR = $script:AproofLivePgliteDataDir
  Write-Host "[live-pglite-env] PGLITE_DATA_DIR=$($env:PGLITE_DATA_DIR)" -ForegroundColor Cyan
  Write-Host "[live-pglite-env] APROOF_PGLITE_DATA_DIR=$($env:APROOF_PGLITE_DATA_DIR)" -ForegroundColor Cyan
}

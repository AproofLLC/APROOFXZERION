param(
  [string]$BaseUrl = "http://127.0.0.1:3000",
  [string]$DbDir = "",
  [string]$ApiKey = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path (Split-Path -Parent $PSScriptRoot) -Parent
$aproofRoot = Join-Path $repoRoot "APROOF"
if (-not $DbDir -or $DbDir.Trim().Length -eq 0) {
  $DbDir = Join-Path $aproofRoot "data\live-test-run-fresh"
}

# Must match key inserted by `npm run seed` (seed-demo.ts). Machine-wide APROOF_API_KEY would otherwise 401 against fresh PGlite.
if ($ApiKey -and $ApiKey.Trim().Length -gt 0) {
  $env:APROOF_API_KEY = $ApiKey.Trim()
}

$env:APROOF_URL = $BaseUrl.TrimEnd('/')
$env:APROOF_PGLITE_DATA_DIR = $DbDir
$env:PGLITE_DATA_DIR = $DbDir

Write-Host "[run-live] APROOF_URL=$($env:APROOF_URL)"
Write-Host "[run-live] PGLITE_DATA_DIR=$($env:PGLITE_DATA_DIR)"

Push-Location $repoRoot
try {
  powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\live-ps1\read-write-contention.ps1" -BaseUrl $env:APROOF_URL
  if ($LASTEXITCODE -ne 0) { throw "read-write-contention.ps1 failed with exit $LASTEXITCODE" }
  powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\live-ps1\digest-stability.ps1" -BaseUrl $env:APROOF_URL
  if ($LASTEXITCODE -ne 0) { throw "digest-stability.ps1 failed with exit $LASTEXITCODE" }
  powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\live-ps1\RUN-ALL-LIVE-TESTS.ps1" -BaseUrl $env:APROOF_URL
  if ($LASTEXITCODE -ne 0) { throw "RUN-ALL-LIVE-TESTS.ps1 failed with exit $LASTEXITCODE" }
}
finally {
  Pop-Location
}

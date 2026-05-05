param(
  [string]$DbDir = "",
  [int]$Port = 3000,
  [switch]$ResetDb
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path (Split-Path -Parent $PSScriptRoot) -Parent
$aproofRoot = Join-Path $repoRoot "APROOF"
if (-not $DbDir -or $DbDir.Trim().Length -eq 0) {
  $DbDir = Join-Path $aproofRoot "data\live-test-run-fresh"
}

Write-Host "[start-live] Repo: $repoRoot"
Write-Host "[start-live] APROOF: $aproofRoot"
Write-Host "[start-live] DB dir: $DbDir"
Write-Host "[start-live] Port: $Port"

$nodeVersion = (& node -v 2>$null)
if (-not $nodeVersion) { throw "Node is not available on PATH." }
$majorTxt = ($nodeVersion -replace '^v', '').Split('.')[0]
$major = 0
if (-not [int]::TryParse($majorTxt, [ref]$major)) { throw "Unable to parse node version: $nodeVersion" }
if ($major -ge 24) {
  throw "Detected Node $nodeVersion. Use Node 20 or 22 LTS for PGlite live testing."
}

$aproofPathPattern = [regex]::Escape($aproofRoot)
Get-CimInstance Win32_Process |
  Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -match $aproofPathPattern } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

if ($ResetDb -and (Test-Path $DbDir)) {
  Write-Host "[start-live] Removing existing DB dir..."
  Remove-Item -Recurse -Force $DbDir
}

Push-Location $aproofRoot
try {
  $env:APROOF_DB_MODE = "pglite"
  $env:APROOF_PGLITE_DATA_DIR = $DbDir
  $env:PGLITE_DATA_DIR = $DbDir
  $env:PORT = "$Port"

  npm run db:migrate
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "[start-live] db:migrate failed (exit $LASTEXITCODE)."
    Write-Warning "[start-live] Attempting one-time PGlite recovery by resetting DB dir and retrying migrate."
    if (Test-Path $DbDir) {
      Remove-Item -Recurse -Force $DbDir -ErrorAction SilentlyContinue
    }
    New-Item -ItemType Directory -Path $DbDir -Force | Out-Null
    npm run db:migrate
    if ($LASTEXITCODE -ne 0) { throw "db:migrate failed after one-time DB reset/retry" }
  }
  npm run seed
  if ($LASTEXITCODE -ne 0) { throw "seed failed" }
  npm run seed:live
  if ($LASTEXITCODE -ne 0) { throw "seed:live failed" }

  Write-Host "[start-live] Starting dev server..."
  npm run dev
}
finally {
  Pop-Location
}

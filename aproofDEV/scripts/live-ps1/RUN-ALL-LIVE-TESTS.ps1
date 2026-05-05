# Run every live script in order. Set APROOF_URL if not using default :3000.
param(
  [string]$BaseUrl = $(if ($env:APROOF_URL) { $env:APROOF_URL } else { "http://127.0.0.1:3000" })
)
$env:APROOF_URL = $BaseUrl.TrimEnd('/')
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path (Split-Path $here -Parent) -Parent
$aproofRoot = Join-Path $repoRoot "APROOF"
$livePgliteEnv = Join-Path $aproofRoot "scripts\live-pglite-env.ps1"
if (Test-Path $livePgliteEnv) {
  . $livePgliteEnv
  Set-AproofLivePgliteEnv
}
. (Join-Path $here "live-common.ps1")

try {
  Assert-AproofServerReachable
} catch {
  Write-Error $_.Exception.Message
  exit 1
}

$scripts = @(
  "subject-burst.ps1",
  "subject-replay.ps1",
  "subject-version-bump.ps1",
  "mixed-subject-traffic.ps1",
  "read-after-write.ps1",
  "list-subject-proofs.ps1",
  "messy-valid-traffic.ps1",
  "concurrent-live-load.ps1",
  "full-live-subject-test.ps1"
)
Write-Host "APROOF_URL=$($env:APROOF_URL)" -ForegroundColor Cyan
$failed = 0
foreach ($s in $scripts) {
  Write-Host "`n########## $s ##########" -ForegroundColor Magenta
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here $s)
  if ($LASTEXITCODE -ne 0) {
    $failed++
    Write-Host "Exit $LASTEXITCODE" -ForegroundColor Red
  }
}
if ($failed -gt 0) {
  Write-Host "`nDone with failures: $failed script(s)." -ForegroundColor Red
  exit 1
}
Write-Host "`nDone. All live scripts passed." -ForegroundColor Green
Write-Host "[live-summary] Interpretation: full-live-subject-test + read-after-write use baseline-complete control payloads (expect clean verified/qualified where noted)." -ForegroundColor DarkGray
Write-Host "[live-summary] messy-valid-traffic is intentionally thin/noisy — flagged proof_status or BASELINE_MISSING there is expected, not a harness defect." -ForegroundColor DarkGray
exit 0

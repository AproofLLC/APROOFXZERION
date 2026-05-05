param(
  [string]$BaseUrl,
  [int]$SoakSeconds = 120
)

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $BaseUrl) {
  $BaseUrl = if ($env:APROOF_URL) { $env:APROOF_URL } else { "http://127.0.0.1:3000" }
}

function Run-StressScript([string]$Name, [string[]]$ExtraArgs = @()) {
  $path = Join-Path $here $Name
  Write-Host "=== $Name ==="
  $all = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $path, "-BaseUrl", $BaseUrl) + $ExtraArgs
  powershell @all
}

Run-StressScript "duplicate-flood.ps1"
Run-StressScript "version-race.ps1"
Run-StressScript "chaos-mix.ps1"
Run-StressScript "read-write-contention.ps1"
Run-StressScript "pagination-churn.ps1"
Run-StressScript "digest-stability.ps1"
Run-StressScript "duplicate-concurrency.ps1"
Run-StressScript "subject-matrix-load.ps1"
Run-StressScript "soak-test.ps1" @("-Seconds", "$SoakSeconds")

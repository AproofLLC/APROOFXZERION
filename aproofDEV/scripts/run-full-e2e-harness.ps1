# Full local harness: fresh PGlite, API :3000, live PS1 proofs, Vite dev-stack-check (proxy),
# then Vitest e2e + stress:inject.
# Usage (repo root): npm run harness:full
#   or: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-full-e2e-harness.ps1 [-SkipDevCheck] [-SkipLivePs1] [-SkipE2e]
param(
  [int]$ApiPort = 3000,
  [string]$PgliteDataDir = "",
  [switch]$SkipLivePs1,
  [switch]$SkipE2e,
  [switch]$SkipStress,
  [switch]$SkipDevCheck
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$aproofRoot = Join-Path $repoRoot "APROOF"
$frontendRoot = Join-Path $repoRoot "frontend"
$livePs1 = Join-Path $repoRoot "scripts\live-ps1"

if (-not (Test-Path $aproofRoot)) { throw "APROOF not found at $aproofRoot" }

$nodeVersion = (& node -v 2>$null)
if (-not $nodeVersion) { throw "Node is not available on PATH." }
$majorTxt = ($nodeVersion -replace '^v', '').Split('.')[0]
$major = 0
if (-not [int]::TryParse($majorTxt, [ref]$major)) { throw "Unable to parse node version: $nodeVersion" }
if ($major -ge 24) {
  throw "Node ${nodeVersion}: use Node 20 or 22 LTS for PGlite live harness."
}

function Stop-CommonDevListeners {
  $kill = Join-Path $aproofRoot "scripts\kill-all-dev-ports.ps1"
  if (Test-Path $kill) {
    & $kill
  }
}

function Stop-AproofApiNodes {
  param([string]$Root)
  $pat = [regex]::Escape($Root)
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -match $pat } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Wait-ApiHealth {
  param([string]$Url, [int]$MaxSec = 90)
  $deadline = (Get-Date).AddSeconds($MaxSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $h = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 2
      if ($h.status -eq "ok" -or $h.ok -eq $true) { return }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  throw "Timeout waiting for healthy API at $Url"
}

function Wait-HttpOk {
  param([string]$Url, [int]$MaxSec = 120)
  $deadline = (Get-Date).AddSeconds($MaxSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  throw "Timeout waiting for HTTP response from $Url"
}

function Invoke-AproofNpmScript {
  param([Parameter(Mandatory)][string]$ScriptName)
  $npmExe = @((Get-Command npm.cmd -ErrorAction Stop))[0].Source
  if (-not $npmExe) { throw "npm.cmd could not be resolved." }
  $max = 4
  for ($t = 1; $t -le $max; $t++) {
    Push-Location $aproofRoot
    try {
      & $npmExe run $ScriptName
    }
    finally {
      Pop-Location
    }
    $code = $LASTEXITCODE
    if ($code -eq 0) { return }
    if ($t -lt $max) {
      Write-Host "[harness] npm run $ScriptName exited $code - retry $t/$($max - 1) after brief pause..." -ForegroundColor Yellow
      Start-Sleep -Milliseconds 900
    }
  }
  throw "npm.cmd run ${ScriptName} failed (exit=$code attempts=$max)"
}

Write-Host "`n[harness] Repo: $repoRoot" -ForegroundColor Cyan
# Deterministic local harness: avoid hot-path Solana Devnet RPC (.env may set ANCHOR_MODE=solana-devnet).
# Real devnet anchoring is covered by `npm run anchor:devnet:*` and manual runs with ANCHOR_MODE=solana-devnet.
$env:ANCHOR_MODE = "mock"
$env:APROOF_API_KEY = "aproof_demo_insecure_change_me"
Write-Host "[harness] ANCHOR_MODE=$($env:ANCHOR_MODE) (harness override for stable PGlite + live PS1)" -ForegroundColor DarkGray
Write-Host "[harness] Phase 0: stop listeners on stack ports" -ForegroundColor Cyan
Stop-CommonDevListeners
Start-Sleep -Milliseconds 400
Stop-AproofApiNodes -Root $aproofRoot

# Harness defaults to %TEMP% for PGlite (stable WASM); repo/data paths under Documents sync folders often abort PGlite.
$liveEnv = Join-Path $aproofRoot "scripts\live-pglite-env.ps1"
if (-not (Test-Path $liveEnv)) { throw "Missing $liveEnv" }
if ($PgliteDataDir -and $PgliteDataDir.Trim().Length -gt 0) {
  $env:APROOF_LIVE_PGLITE_DATA_DIR = $PgliteDataDir.Trim()
}
elseif (-not $env:APROOF_LIVE_PGLITE_DATA_DIR -or $env:APROOF_LIVE_PGLITE_DATA_DIR.Trim().Length -eq 0) {
  $env:APROOF_LIVE_PGLITE_DATA_DIR = Join-Path $env:TEMP "aproof-harness-pglite"
  Write-Host "[harness] PGlite dir (default TEMP): $($env:APROOF_LIVE_PGLITE_DATA_DIR)" -ForegroundColor DarkGray
}
. $liveEnv
Set-AproofLivePgliteEnv
$dataDir = $script:AproofLivePgliteDataDir
Write-Host "[harness] PGlite data: $dataDir" -ForegroundColor Cyan

if (Test-Path $dataDir) {
  Write-Host "[harness] Removing existing PGlite dir..." -ForegroundColor Yellow
  Remove-Item -Recurse -Force $dataDir
}
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
Start-Sleep -Milliseconds 600

$env:APROOF_DB_MODE = "pglite"
$env:PGLITE_DATA_DIR = $dataDir
$env:APROOF_PGLITE_DATA_DIR = $dataDir
$env:PORT = "$ApiPort"
Remove-Item Env:\APROOF_PORT -ErrorAction SilentlyContinue

Write-Host "[harness] Phase 1: migrate + seed + seed:live" -ForegroundColor Cyan

Invoke-AproofNpmScript "db:migrate"
Invoke-AproofNpmScript "seed"
Invoke-AproofNpmScript "seed:live"

Write-Host "[harness] Phase 2: start API (tsx src/main.ts) on port $ApiPort" -ForegroundColor Cyan
$apiProc = $null
$apiRunnerCmd = $null
$apiLog = $null
$nodeExe = (Get-Command node -ErrorAction Stop).Source
$tsxCli = Join-Path $aproofRoot "node_modules\tsx\dist\cli.mjs"
if (-not (Test-Path $tsxCli)) { throw "Missing tsx CLI at $tsxCli (run npm install in APROOF)" }
$apiRunnerCmd = Join-Path $env:TEMP "aproof-harness-api-$([guid]::NewGuid().ToString('n')).cmd"
$apiLog = Join-Path $env:TEMP "aproof-harness-api-$([guid]::NewGuid().ToString('n')).log"
$apiCmdBody = @"
@echo off
cd /d "$aproofRoot"
set APROOF_DB_MODE=pglite
set PGLITE_DATA_DIR=$dataDir
set APROOF_PGLITE_DATA_DIR=$dataDir
set PORT=$ApiPort
set ANCHOR_MODE=mock
set APROOF_API_KEY=aproof_demo_insecure_change_me
"$nodeExe" "$tsxCli" src\main.ts >> "$apiLog" 2>&1
"@
Set-Content -Path $apiRunnerCmd -Value $apiCmdBody -Encoding ASCII
try {
  # cmd.exe /c ensures the launcher runs with predictable PATH / shell semantics.
  $apiProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "`"$apiRunnerCmd`"" -PassThru -WindowStyle Hidden
  if (-not $apiProc) { throw "Failed to start API process" }
} catch {
  Remove-Item $apiRunnerCmd -Force -ErrorAction SilentlyContinue
  throw
}

# Use 127.0.0.1 — on Windows, "localhost" may resolve to ::1 while Fastify binds IPv4 only.
$baseUrl = "http://127.0.0.1:$ApiPort"
try {
  try {
    Wait-ApiHealth -Url "$baseUrl/health" -MaxSec 120
  } catch {
    if (Test-Path $apiLog) {
      Write-Host "[harness] API log tail ($apiLog):" -ForegroundColor Yellow
      Get-Content $apiLog -Tail 80 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
    }
    throw
  }

  $env:APROOF_URL = $baseUrl
  $env:APROOF_PGLITE_DATA_DIR = $dataDir
  $env:PGLITE_DATA_DIR = $dataDir
  # read-write-contention.ps1 defaults to 20 concurrent writes + 20 reads — kills PGlite if all fire at once.
  if (-not $env:APROOF_STRESS_RW_MAX_PARALLEL -or $env:APROOF_STRESS_RW_MAX_PARALLEL.Trim().Length -eq 0) {
    $env:APROOF_STRESS_RW_MAX_PARALLEL = "4"
  }
  if (-not $env:APROOF_STRESS_RW_READ_MAX_PARALLEL -or $env:APROOF_STRESS_RW_READ_MAX_PARALLEL.Trim().Length -eq 0) {
    $env:APROOF_STRESS_RW_READ_MAX_PARALLEL = "1"
  }
  # concurrent-live-load.ps1 — batched waves (see script).
  if (-not $env:APROOF_LIVE_CONCURRENT_MAX_PARALLEL -or $env:APROOF_LIVE_CONCURRENT_MAX_PARALLEL.Trim().Length -eq 0) {
    $env:APROOF_LIVE_CONCURRENT_MAX_PARALLEL = "1"
  }
  # PGlite single-writer: fewer back-to-back POSTs + brief cooldown reduces API stall/crash before full-live-subject-test.
  if (-not $env:APROOF_LIVE_CONCURRENT_EVENT_JOBS -or $env:APROOF_LIVE_CONCURRENT_EVENT_JOBS.Trim().Length -eq 0) {
    $env:APROOF_LIVE_CONCURRENT_EVENT_JOBS = "18"
  }
  if (-not $env:APROOF_LIVE_CONCURRENT_COOLDOWN_MS -or $env:APROOF_LIVE_CONCURRENT_COOLDOWN_MS.Trim().Length -eq 0) {
    $env:APROOF_LIVE_CONCURRENT_COOLDOWN_MS = "45"
  }
  if (-not $env:APROOF_LIVE_HEALTH_MAX_WAIT_SEC -or $env:APROOF_LIVE_HEALTH_MAX_WAIT_SEC.Trim().Length -eq 0) {
    $env:APROOF_LIVE_HEALTH_MAX_WAIT_SEC = "45"
  }
  if (-not $env:APROOF_SUBJECT_BURST_COOLDOWN_MS -or $env:APROOF_SUBJECT_BURST_COOLDOWN_MS.Trim().Length -eq 0) {
    $env:APROOF_SUBJECT_BURST_COOLDOWN_MS = "280"
  }

  if (-not $SkipLivePs1) {
    Write-Host "[harness] Phase 3: RUN-LIVE-TESTS.ps1 (read-write contention, digest stability, full live suite)" -ForegroundColor Cyan
    $runner = Join-Path $livePs1 "RUN-LIVE-TESTS.ps1"
    & powershell -NoProfile -ExecutionPolicy Bypass -File $runner -BaseUrl $baseUrl -DbDir $dataDir -ApiKey $env:APROOF_API_KEY
    if ($LASTEXITCODE -ne 0) { throw "RUN-LIVE-TESTS.ps1 failed ($LASTEXITCODE)" }
  } else {
    Write-Host "[harness] Skipping live PS1 (--SkipLivePs1)" -ForegroundColor DarkGray
  }

  if (-not $SkipDevCheck) {
    Write-Host "[harness] Phase 4: Vite + node scripts/dev-stack-check.mjs (proxy harness, while API fresh)" -ForegroundColor Cyan
    Start-Sleep -Seconds 3
    try {
      Wait-ApiHealth -Url "$baseUrl/health" -MaxSec 180
    } catch {
      if (Test-Path $apiLog) {
        Write-Host "[harness] API log tail ($apiLog):" -ForegroundColor Yellow
        Get-Content $apiLog -Tail 80 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
      }
      throw
    }

    $viteBin = Join-Path $frontendRoot "node_modules\vite\bin\vite.js"
    if (-not (Test-Path $viteBin)) { throw "Missing Vite at $viteBin (run npm install in frontend)" }
    $viteRunnerCmd = Join-Path $env:TEMP "aproof-harness-vite-$([guid]::NewGuid().ToString('n')).cmd"
    $viteLog = Join-Path $env:TEMP "aproof-harness-vite-$([guid]::NewGuid().ToString('n')).log"
    $viteCmdBody = @"
@echo off
cd /d "$frontendRoot"
set APROOF_PORT=$ApiPort
set VITE_API_PROXY_TARGET=http://127.0.0.1:$ApiPort
"$nodeExe" "$viteBin" --host 127.0.0.1 --port 5173 --strictPort >> "$viteLog" 2>&1
"@
    Set-Content -Path $viteRunnerCmd -Value $viteCmdBody -Encoding ASCII
    $viteProc = $null
    try {
      $viteProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "`"$viteRunnerCmd`"" -PassThru -WindowStyle Hidden
      if (-not $viteProc) { throw "Failed to start Vite" }
      try {
        Wait-HttpOk -Url "http://127.0.0.1:5173/" -MaxSec 120
      } catch {
        if (Test-Path $viteLog) {
          Write-Host "[harness] Vite log tail ($viteLog):" -ForegroundColor Yellow
          Get-Content $viteLog -Tail 60 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
        }
        throw
      }
      Start-Sleep -Seconds 2
      $env:APROOF_PORT = "$ApiPort"
      $env:PORT = "$ApiPort"
      Push-Location $repoRoot
      try {
        node scripts/dev-stack-check.mjs
        if ($LASTEXITCODE -ne 0) { throw "dev-stack-check failed ($LASTEXITCODE)" }
      }
      finally {
        Pop-Location
      }
    }
    finally {
      Remove-Item $viteRunnerCmd -Force -ErrorAction SilentlyContinue
      if ($viteLog) {
        Remove-Item $viteLog -Force -ErrorAction SilentlyContinue
      }
      if ($viteProc) {
        Stop-Process -Id $viteProc.Id -Force -ErrorAction SilentlyContinue
      }
      Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
      }
    }
  } else {
    Write-Host "[harness] Skipping dev:check (--SkipDevCheck)" -ForegroundColor DarkGray
  }

  if (-not $SkipE2e) {
    Write-Host "[harness] Phase 5: Vitest e2e (in-process proof harness)" -ForegroundColor Cyan
    # Vitest must not inherit PGlite dirs from this shell — WASM PGlite is single-writer; sharing breaks the harness API DB.
    Remove-Item Env:\PGLITE_DATA_DIR -ErrorAction SilentlyContinue
    Remove-Item Env:\APROOF_PGLITE_DATA_DIR -ErrorAction SilentlyContinue
    try {
      Invoke-AproofNpmScript "test:e2e"
    }
    finally {
      $env:PGLITE_DATA_DIR = $dataDir
      $env:APROOF_PGLITE_DATA_DIR = $dataDir
    }
  } else {
    Write-Host "[harness] Skipping e2e (--SkipE2e)" -ForegroundColor DarkGray
  }

  if (-not $SkipStress) {
    Write-Host "[harness] Phase 6: stress-inject burst (Vitest)" -ForegroundColor Cyan
    Remove-Item Env:\PGLITE_DATA_DIR -ErrorAction SilentlyContinue
    Remove-Item Env:\APROOF_PGLITE_DATA_DIR -ErrorAction SilentlyContinue
    try {
      Invoke-AproofNpmScript "stress:inject"
    }
    finally {
      $env:PGLITE_DATA_DIR = $dataDir
      $env:APROOF_PGLITE_DATA_DIR = $dataDir
    }
  }

  Write-Host "`n[harness] ALL PHASES PASSED" -ForegroundColor Green
}
finally {
  if ($apiRunnerCmd) {
    Remove-Item $apiRunnerCmd -Force -ErrorAction SilentlyContinue
  }
  if ($apiLog) {
    Remove-Item $apiLog -Force -ErrorAction SilentlyContinue
  }
  if ($apiProc) {
    Write-Host "[harness] Stopping API (wrapper pid $($apiProc.Id))..." -ForegroundColor DarkGray
    Stop-Process -Id $apiProc.Id -Force -ErrorAction SilentlyContinue
  }
  Stop-AproofApiNodes -Root $aproofRoot
  Remove-Item Env:\VITE_API_PROXY_TARGET -ErrorAction SilentlyContinue
  Remove-Item Env:\APROOF_PORT -ErrorAction SilentlyContinue
}

exit 0

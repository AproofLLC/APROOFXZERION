# Dot-source from other scripts in this folder:
#   . (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "live-common.ps1")
#
# Prerequisite (from APROOF directory, same PGlite dir as the server):
#   Full stack proof harness (fresh DB + API :3040 + PS1 + e2e + Vite check): from repo root, npm run harness:full
#   Recommended: npm run dev:live   → PORT 3101, fresh data\live-test-run-fresh (or TEMP on OneDrive trees)
#   Or manual:
#   $env:APROOF_DB_MODE = "pglite"
#   $env:PGLITE_DATA_DIR = "$PWD\data\your-db"
#   npm run db:migrate && npm run seed && npm run seed:live && npm run dev   # default port 3040 unless PORT set
#
# API requires UUID subject_id, org/env, trace_id, occurred_at, x-api-key, and a mapped source_type_key.
#
# PGlite: POST /events resolves subjects with (subject_id, organization_id, environment_id).
# register-test-subject MUST use the same database files as the server, or you get NOT_PROOFABLE / subject_not_unique_or_missing (0 rows).
# For local live runs, keep server and scripts on the same path, for example:
#   <repo>\APROOF\data\pglite
# Align with APROOF runtime (see src/db/pglite.ts):
#   1) PGLITE_DATA_DIR
#   2) APROOF_PGLITE_DATA_DIR
#   3) default: <repo>\APROOF\data\pglite

$script:LivePs1Root = $PSScriptRoot
# live-ps1 lives at <repo>/scripts/live-ps1 — repo root is two levels up from PSScriptRoot
$script:LiveRepoRoot = Split-Path (Split-Path $script:LivePs1Root -Parent) -Parent
$script:LiveAproofRoot = Join-Path $script:LiveRepoRoot "APROOF"
$script:LiveDefaultPgliteDir = Join-Path $script:LiveAproofRoot "data\pglite"

if (-not $env:PGLITE_DATA_DIR) {
  if ($env:APROOF_PGLITE_DATA_DIR) {
    $env:PGLITE_DATA_DIR = $env:APROOF_PGLITE_DATA_DIR
  } else {
    $env:PGLITE_DATA_DIR = $script:LiveDefaultPgliteDir
    Write-Warning "[live-harness] Neither PGLITE_DATA_DIR nor APROOF_PGLITE_DATA_DIR was set. Using default: $script:LiveDefaultPgliteDir"
  }
}

$script:LiveBaseUrl = if ($env:APROOF_URL) { $env:APROOF_URL.TrimEnd('/') } else { "http://127.0.0.1:3040" }
$script:LiveApiKey = if ($env:APROOF_API_KEY) { $env:APROOF_API_KEY } else { "aproof_demo_insecure_change_me" }
$script:LiveOrgId = "11111111-1111-4111-8111-111111111111"
$script:LiveEnvId = "22222222-2222-4222-8222-222222222222"
$script:LiveSourceKey = "demo.policy_checked"
$script:LiveSourceKeyRealAction = "demo.real.action_completed"

$script:LiveHeaders = @{
  "x-api-key" = $script:LiveApiKey
}

. (Join-Path $script:LivePs1Root "demo-clean-payloads.ps1")

function Assert-LiveNodeCompatibility {
  $nodeVersion = (& node -v 2>$null)
  if (-not $nodeVersion) { return }
  $majorTxt = ($nodeVersion -replace '^v', '').Split('.')[0]
  $major = 0
  if (-not [int]::TryParse($majorTxt, [ref]$major)) { return }
  if ($major -ge 24) {
    throw "Node $nodeVersion is not supported for PGlite in this repo runtime. Use Node 20 or 22 LTS, then re-run the live scripts."
  }
}

Assert-LiveNodeCompatibility

# Seeded by npm run seed:live (see src/scripts/seed-live-test-subjects.ts)
$script:SubjReplay = "44444444-4444-4444-8444-444444444401"
$script:SubjVersion = "44444444-4444-4444-8444-444444444402"
$script:SubjM1 = "44444444-4444-4444-8444-444444444411"
$script:SubjA1 = "44444444-4444-4444-8444-444444444412"
$script:SubjS1 = "44444444-4444-4444-8444-444444444413"
$script:SubjE1 = "44444444-4444-4444-8444-444444444414"
$script:SubjSys1 = "44444444-4444-4444-8444-444444444415"
$script:SubjRead = "44444444-4444-4444-8444-444444444421"
$script:SubjList = "44444444-4444-4444-8444-444444444422"
$script:SubjMessy = "44444444-4444-4444-8444-444444444423"
$script:SubjConcurrent = "44444444-4444-4444-8444-444444444424"
$script:SubjLive001 = "44444444-4444-4444-8444-444444444431"
$script:SubjLiveReplay = "44444444-4444-4444-8444-444444444432"
$script:SubjBurstLive = "44444444-4444-4444-8444-444444444433"
$script:SubjRealSystem = "66666666-6666-4666-8666-666666666601"

function Add-PolicyIfMissing([hashtable]$Payload) {
  $p = @{} + $Payload
  if (-not $p.ContainsKey("host")) { $p["host"] = "live-ps1" }
  if (-not $p.ContainsKey("policy")) { $p["policy"] = @{ tags = @("allow_read") } }
  # Generic stable key for artifact identity (see GENERIC_STABLE_KEYS / e2e harness).
  if (-not $p.ContainsKey("record_id")) { $p["record_id"] = "live-ps1-generic-record" }
  $p
}

function New-AproofEventBody {
  param(
    [Parameter(Mandatory)][string]$SubjectId,
    [Parameter(Mandatory)][hashtable]$Payload,
    [Parameter(Mandatory)][string]$EventLineageId,
    [int]$EventVersion = 1,
    [string]$TraceId,
    [string]$ArtifactId,
    [string]$OccurredAt,
    [string]$SourceTypeKey
  )
  if (-not $TraceId) { $TraceId = "trace-" + [guid]::NewGuid().ToString() }
  if (-not $OccurredAt) { $OccurredAt = [datetime]::UtcNow.ToString("o") }
  if (-not $SourceTypeKey) { $SourceTypeKey = $script:LiveSourceKey }
  $h = @{
    organization_id = $script:LiveOrgId
    environment_id = $script:LiveEnvId
    source_type_key = $SourceTypeKey
    subject_id = $SubjectId
    event_lineage_id = $EventLineageId
    event_version = $EventVersion
    trace_id = $TraceId
    occurred_at = $OccurredAt
    payload = (Add-PolicyIfMissing $Payload)
  }
  if ($ArtifactId) { $h["artifact_id"] = $ArtifactId }
  $h
}

function Invoke-AproofPostEvent {
  param([hashtable]$BodyHashtable)
  $json = $BodyHashtable | ConvertTo-Json -Depth 25
  Invoke-RestMethod -Uri "$script:LiveBaseUrl/events" -Method Post `
    -Headers $script:LiveHeaders -ContentType "application/json; charset=utf-8" -Body $json
}

function Add-AproofShimProperties {
  param($Raw)
  if ($Raw -and $Raw.PSObject.Properties["product_proof"]) {
    $pp = $Raw.product_proof
    $id = $Raw.identity
    $ev = [ordered]@{
      event_id = $Raw.event_id
      event_lineage_id = $id.event_lineage_id
      event_version = $id.event_version
      lineage_status = $pp.lineage_status
      lineage_reason = $pp.lineage_reason
      proof_id = $pp.proof_id
    }
    $Raw | Add-Member -Force -NotePropertyName event -NotePropertyValue ([pscustomobject]$ev)
    $Raw | Add-Member -Force -NotePropertyName proof_id -NotePropertyValue $pp.proof_id
    $Raw | Add-Member -Force -NotePropertyName contract_valid -NotePropertyValue $pp.contract_valid
    $Raw | Add-Member -Force -NotePropertyName angles -NotePropertyValue $pp.angles
  }
  $Raw
}

function Invoke-AproofGet {
  param([Parameter(Mandatory)][string]$RelativePath)
  Invoke-RestMethod -Uri "$script:LiveBaseUrl$RelativePath" -Headers $script:LiveHeaders -Method Get
}

function Assert-AproofServerReachable {
  param(
    [int]$TimeoutSec = 4,
    [int]$MaxWaitSec = 15
  )

  if ($env:APROOF_LIVE_HEALTH_MAX_WAIT_SEC -match '^\d+$') {
    $mw = [int]$env:APROOF_LIVE_HEALTH_MAX_WAIT_SEC
    if ($mw -ge 1 -and $mw -le 120) { $MaxWaitSec = $mw }
  }

  $deadline = (Get-Date).AddSeconds($MaxWaitSec)
  $lastErr = $null
  while ((Get-Date) -lt $deadline) {
    try {
      $h = Invoke-RestMethod -Uri "$script:LiveBaseUrl/health" -Method Get -TimeoutSec $TimeoutSec
      if ($h.status -eq "ok") { return }
      $lastErr = "Unexpected /health body: $($h | ConvertTo-Json -Compress)"
    }
    catch {
      $lastErr = $_.Exception.Message
    }
    Start-Sleep -Milliseconds 400
  }
  throw "AProof server is not reachable at $script:LiveBaseUrl (or not ready) after ${MaxWaitSec}s. Start the server first, then rerun. Last error: $lastErr"
}

function Write-LiveHarnessDbContext {
  Write-Host "[live-harness] BaseUrl: $($script:LiveBaseUrl)"
  Write-Host "[live-harness] organization_id (POST body): $($script:LiveOrgId)"
  Write-Host "[live-harness] environment_id (POST body): $($script:LiveEnvId)"
  Write-Host "[live-harness] Effective DB mode for register script: $(if ($env:APROOF_DB_MODE) { $env:APROOF_DB_MODE } else { '(unset; Register-AproofTestSubject defaults to pglite when DATABASE_URL is also unset)' })"
  Write-Host "[live-harness] PGLITE_DATA_DIR (must match server): $($env:PGLITE_DATA_DIR)"
  Write-Host "[live-harness] APROOF_PGLITE_DATA_DIR: $($env:APROOF_PGLITE_DATA_DIR)"
  Write-Host "[live-harness] Runtime precedence (Node): PGLITE_DATA_DIR > APROOF_PGLITE_DATA_DIR > default($script:LiveDefaultPgliteDir)"
}

<#
  Ensures demo tenant + subject row exist in the SAME DB the server uses (see PGLITE_DATA_DIR).
  Ingest looks up: subjects.id = subject_id AND organization_id AND environment_id = demo UUIDs below.
#>
function Register-AproofTestSubject {
  param(
    [Parameter(Mandatory)][string]$SubjectId,
    [ValidateSet("system", "service", "agent", "model", "endpoint")][string]$Rail = "system",
    [switch]$Quiet,
    [int]$MaxAttempts = 3
  )
  if (-not $Quiet) { Write-LiveHarnessDbContext }
  if (-not (Test-Path $script:LiveAproofRoot)) {
    throw "APROOF folder not found at $script:LiveAproofRoot"
  }
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    Push-Location $script:LiveAproofRoot
    try {
      if (-not $env:APROOF_DB_MODE -and -not $env:DATABASE_URL) {
        $env:APROOF_DB_MODE = "pglite"
      }
      & npx --yes tsx src/scripts/register-test-subject.ts $SubjectId $Rail
      if ($LASTEXITCODE -eq 0) { break }
      if ($attempt -lt $MaxAttempts) {
        $delay = 500 * $attempt
        Write-Warning "[live-harness] register-test-subject attempt $attempt/$MaxAttempts failed (exit $LASTEXITCODE). Retrying in ${delay}ms."
        Start-Sleep -Milliseconds $delay
      } else {
        throw "register-test-subject failed with exit $LASTEXITCODE"
      }
    }
    finally {
      Pop-Location
    }
  }
  if (-not $Quiet) {
    Write-Host "[live-harness] Registered subject_id: $SubjectId (rail=$Rail) - POST must use same id + org + env above."
  }
}

function Ensure-AproofLiveSeedData {
  param(
    [switch]$Quiet,
    [switch]$BestEffortSeed
  )

  if (-not (Test-Path $script:LiveAproofRoot)) {
    throw "APROOF folder not found at $script:LiveAproofRoot"
  }

  Push-Location $script:LiveAproofRoot
  try {
    # PGlite is single-writer: never run npm seed while the API holds the DB open.
    # Detect any healthy server at the harness URL (covers `npm run dev`, `tsx src/main.ts`, etc.).
    $serverRunning = $false
    try {
      $h = Invoke-RestMethod -Uri "$script:LiveBaseUrl/health" -Method Get -TimeoutSec 2
      if ($h.status -eq "ok") { $serverRunning = $true }
    } catch {
      $serverRunning = $false
    }

    if ($serverRunning) {
      if (-not $Quiet) {
        Write-Host "[live-harness] API reachable at $script:LiveBaseUrl — skipping npm seed (PGlite single-writer). DB was seeded before the server started." -ForegroundColor Cyan
      }
      return
    }

    if (-not $env:APROOF_DB_MODE -and -not $env:DATABASE_URL) {
      $env:APROOF_DB_MODE = "pglite"
    }

    if (-not $Quiet) {
      Write-Host "[live-harness] Seeding demo + live subjects into: $env:PGLITE_DATA_DIR"
    }

    npm run seed
    if ($LASTEXITCODE -ne 0) {
      $msg = "[live-harness] seed FAILED (exit $LASTEXITCODE) — stopping. DB: $($env:PGLITE_DATA_DIR)"
      if ($BestEffortSeed) {
        Write-Warning "$msg — continuing (BestEffortSeed)."
        return
      }
      throw $msg
    }
    if (-not $Quiet) { Write-Host "[live-harness] seed OK" -ForegroundColor Green }

    npm run seed:live
    if ($LASTEXITCODE -ne 0) {
      $msg = "[live-harness] seed:live FAILED (exit $LASTEXITCODE) — stopping. DB: $($env:PGLITE_DATA_DIR)"
      if ($BestEffortSeed) {
        Write-Warning "$msg — continuing (BestEffortSeed)."
        return
      }
      throw $msg
    }
    if (-not $Quiet) { Write-Host "[live-harness] seed:live OK" -ForegroundColor Green }
  }
  finally {
    Pop-Location
  }
}

param(
  [string]$BaseUrl
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here "stress-common.ps1")
Set-StressBaseUrl $BaseUrl

# Uses pre-seeded StressRw from seed:live to avoid opening a second PGlite writer process.
# If you need ad-hoc registration, run register-test-subject manually before starting dev server.

$base = $script:LiveBaseUrl
$org = $script:LiveOrgId
$env = $script:LiveEnvId
$key = $script:LiveApiKey
$src = $script:LiveSourceKey
$sub = $script:StressRw

# Same PGlite single-writer constraint as concurrent-live-load — default full parallelism; harness lowers via env.
$maxParallel = 20
if ($env:APROOF_STRESS_RW_MAX_PARALLEL -match '^\d+$') {
  $mp = [int]$env:APROOF_STRESS_RW_MAX_PARALLEL
  if ($mp -ge 1 -and $mp -le 40) { $maxParallel = $mp }
}
# Reads are lighter than POST/proof-build but parallel GETs can still stall PGlite; default conservative.
$readMaxParallel = 4
if ($env:APROOF_STRESS_RW_READ_MAX_PARALLEL -match '^\d+$') {
  $rp = [int]$env:APROOF_STRESS_RW_READ_MAX_PARALLEL
  if ($rp -ge 1 -and $rp -le 20) { $readMaxParallel = $rp }
}

function New-WriteJob([int]$i) {
  Start-Job -ScriptBlock {
    param($base, $n, $orgId, $envId, $apiKey, $sourceKey, $subjectId)
    $headers = @{ "x-api-key" = $apiKey }
    $payload = @{
      record_id         = "live-rw-record-$n"
      host              = "rw-contention"
      tick              = $n
      name              = "ehr-suite"
      policy            = @{ tags = @("allow_read"); version = "v1" }
      system            = @{ rails = @("ehr", "queue", "llm", "audit") }
      identity_access   = @{
        actor_id = "actor-rw-$n"; role = "operator"; principal_id = "actor-rw-$n"
        granted_scopes = @("read:proofs"); scopes = @("read:proofs"); tenant_id = "tenant_demo"
        access_log_present = $true; token_valid = $true; token_expired = $false
      }
      operational       = @{ execution_status = "success"; latency_ms = 90; runtime_error = $null }
      model_identity    = @{ observed_model = "gpt-4.1-mini" }
      retrieval         = @{ retrieved_sources = @("db", "cache") }
      deterministic     = @{ observed_digest = "digest-$n"; temperature = 0 }
      workflow          = @{ stage = "commit" }
      cross_system      = @{ observed_systems = @("ehr", "queue", "llm") }
      sync_id           = "sync-rw-$n"
      correlation_id    = "corr-rw-$n"
    }
    $body = @{
      organization_id  = $orgId
      environment_id   = $envId
      source_type_key  = $sourceKey
      subject_id       = $subjectId
      event_lineage_id = [guid]::NewGuid().ToString()
      event_version    = 1
      trace_id         = "rw-w-" + $n
      occurred_at      = [datetime]::UtcNow.ToString("o")
      payload          = $payload
    } | ConvertTo-Json -Depth 25
    try {
      $r = Invoke-RestMethod -Uri "$base/events" -Method Post -Headers $headers `
        -ContentType "application/json; charset=utf-8" -Body $body
      [PSCustomObject]@{ kind = "write"; ok = $true; proof_id = $r.product_proof.proof_id; version = $r.identity.event_version }
    }
    catch {
      [PSCustomObject]@{ kind = "write"; ok = $false; error = $_.Exception.Message }
    }
  } -ArgumentList $base, $i, $org, $env, $key, $src, $sub
}

function Invoke-ReadProofsOnce {
  param([string]$baseUrl, [hashtable]$hdrs, [string]$subjectId)
  $attempts = 6
  if ($env:APROOF_STRESS_RW_READ_ATTEMPTS -match '^\d+$') {
    $ra = [int]$env:APROOF_STRESS_RW_READ_ATTEMPTS
    if ($ra -ge 1 -and $ra -le 20) { $attempts = $ra }
  }
  $delayMs = 120
  if ($env:APROOF_STRESS_RW_READ_DELAY_MS -match '^\d+$') {
    $rd = [int]$env:APROOF_STRESS_RW_READ_DELAY_MS
    if ($rd -ge 0 -and $rd -le 3000) { $delayMs = $rd }
  }
  for ($a = 1; $a -le $attempts; $a++) {
    try {
      $r = Invoke-RestMethod -Uri "$baseUrl/subjects/$subjectId/proofs?limit=5&offset=0" -Headers $hdrs -Method Get -TimeoutSec 120
      return [PSCustomObject]@{ kind = "read"; ok = $true; count = $r.items.Count }
    }
    catch {
      if ($a -eq $attempts) {
        return [PSCustomObject]@{ kind = "read"; ok = $false; error = $_.Exception.Message }
      }
      Start-Sleep -Milliseconds $delayMs
    }
  }
}

function New-ReadJob([int]$i, [int]$Attempts, [int]$DelayMs) {
  Start-Job -ScriptBlock {
    param($base, $n, $apiKey, $subjectId, $attempts, $delayMs)
    $headers = @{ "x-api-key" = $apiKey }
    for ($a = 1; $a -le $attempts; $a++) {
      try {
        $r = Invoke-RestMethod -Uri "$base/subjects/$subjectId/proofs?limit=5&offset=0" -Headers $headers -Method Get -TimeoutSec 120
        return [PSCustomObject]@{ kind = "read"; ok = $true; count = $r.items.Count }
      }
      catch {
        if ($a -eq $attempts) {
          return [PSCustomObject]@{ kind = "read"; ok = $false; error = $_.Exception.Message }
        }
        Start-Sleep -Milliseconds $delayMs
      }
    }
  } -ArgumentList $base, $i, $key, $sub, $Attempts, $DelayMs
}

$results = @()
$writeCount = 20
$readCount = 20

for ($batchStart = 1; $batchStart -le $writeCount; $batchStart += $maxParallel) {
  $batchEnd = [Math]::Min($writeCount, $batchStart + $maxParallel - 1)
  $jobs = $batchStart..$batchEnd | ForEach-Object { New-WriteJob $_ }
  $results += $jobs | Receive-Job -Wait -AutoRemoveJob
}

$readAttempts = 6
if ($env:APROOF_STRESS_RW_READ_ATTEMPTS -match '^\d+$') {
  $ra0 = [int]$env:APROOF_STRESS_RW_READ_ATTEMPTS
  if ($ra0 -ge 1 -and $ra0 -le 20) { $readAttempts = $ra0 }
}
$readRetryDelayMs = 120
if ($env:APROOF_STRESS_RW_READ_DELAY_MS -match '^\d+$') {
  $rd0 = [int]$env:APROOF_STRESS_RW_READ_DELAY_MS
  if ($rd0 -ge 0 -and $rd0 -le 3000) { $readRetryDelayMs = $rd0 }
}

$readHeaders = @{ "x-api-key" = $key }
if ($readMaxParallel -le 1) {
  foreach ($i in 1..$readCount) {
    $results += Invoke-ReadProofsOnce -baseUrl $base -hdrs $readHeaders -subjectId $sub
    Start-Sleep -Milliseconds 35
  }
}
else {
  for ($batchStart = 1; $batchStart -le $readCount; $batchStart += $readMaxParallel) {
    $batchEnd = [Math]::Min($readCount, $batchStart + $readMaxParallel - 1)
    $jobs = $batchStart..$batchEnd | ForEach-Object { New-ReadJob $_ -Attempts $readAttempts -DelayMs $readRetryDelayMs }
    $results += $jobs | Receive-Job -Wait -AutoRemoveJob
    Start-Sleep -Milliseconds 150
  }
}

$results | Format-Table -AutoSize
$results | Group-Object kind, ok | Format-Table Count, Name -AutoSize

$wf = (@($results) | Where-Object { $_.kind -eq "write" -and -not $_.ok }).Count
$rf = (@($results) | Where-Object { $_.kind -eq "read" -and -not $_.ok }).Count
if ($wf -gt 0 -or $rf -gt 0) {
  Write-Host "FAIL: write_failures=$wf read_failures=$rf (StressRw is system rail: payloads must satisfy baseline-complete contract)." -ForegroundColor Red
  exit 1
}
Write-Host "read-write contention: OK" -ForegroundColor Green
exit 0

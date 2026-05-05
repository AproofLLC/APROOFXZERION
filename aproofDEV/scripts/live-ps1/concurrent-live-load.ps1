# Parallel jobs: each request uses its own lineage UUID to avoid (lineage,version) races.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here "live-common.ps1")

$url = $script:LiveBaseUrl
$key = $script:LiveApiKey
$org = $script:LiveOrgId
$envId = $script:LiveEnvId
$src = $script:LiveSourceKey
$sub = $script:SubjConcurrent

# Parallel POST /events against PGlite can overwhelm the embedded DB (500 / dropped connections).
# Override via APROOF_LIVE_CONCURRENT_EVENT_JOBS (harness sets a conservative default).
$jobCount = 25
if ($env:APROOF_LIVE_CONCURRENT_EVENT_JOBS -match '^\d+$') {
  $parsed = [int]$env:APROOF_LIVE_CONCURRENT_EVENT_JOBS
  if ($parsed -ge 1 -and $parsed -le 100) { $jobCount = $parsed }
}

# How many jobs run at once (PGlite + Fastify can 500 if every POST overlaps).
$maxParallel = 25
if ($env:APROOF_LIVE_CONCURRENT_MAX_PARALLEL -match '^\d+$') {
  $mp = [int]$env:APROOF_LIVE_CONCURRENT_MAX_PARALLEL
  if ($mp -ge 1 -and $mp -le 100) { $maxParallel = $mp }
}

$restAttempts = 5
if ($env:APROOF_LIVE_REST_ATTEMPTS -match '^\d+$') {
  $ra = [int]$env:APROOF_LIVE_REST_ATTEMPTS
  if ($ra -ge 1 -and $ra -le 20) { $restAttempts = $ra }
}
$restDelayMs = 150
if ($env:APROOF_LIVE_REST_DELAY_MS -match '^\d+$') {
  $rd = [int]$env:APROOF_LIVE_REST_DELAY_MS
  if ($rd -ge 0 -and $rd -le 5000) { $restDelayMs = $rd }
}

$headers = @{ "x-api-key" = $key }

function Invoke-ConcurrentEventOnce {
  param(
    [string]$baseUrl,
    [hashtable]$hdrs,
    [string]$organizationId,
    [string]$environmentId,
    [string]$sourceKey,
    [string]$subjectId,
    [int]$i
  )
  $lineage = [guid]::NewGuid().ToString()
  $payload = @{
    record_id       = "live-conc-record-$i"
    host            = "conc"
    tick            = $i
    name            = "ehr-suite"
    policy          = @{ tags = @("allow_read"); version = "v1" }
    system          = @{ rails = @("ehr", "queue", "llm", "audit") }
    identity_access = @{
      actor_id = "actor-conc"; role = "operator"; principal_id = "actor-conc"
      granted_scopes = @("read:proofs"); scopes = @("read:proofs"); tenant_id = "tenant_demo"
      access_log_present = $true; token_valid = $true; token_expired = $false
    }
    operational     = @{ execution_status = "success"; latency_ms = 80; runtime_error = $null }
    model_identity  = @{ observed_model = "gpt-4.1-mini" }
    retrieval       = @{ retrieved_sources = @("db", "cache") }
    deterministic   = @{ observed_digest = "d-$i"; temperature = 0 }
    workflow        = @{ stage = "commit" }
    cross_system    = @{ observed_systems = @("ehr", "queue", "llm") }
    sync_id         = "sync-conc-$i"
    correlation_id  = "corr-conc-$i"
  }
  $bodyObj = @{
    organization_id  = $organizationId
    environment_id   = $environmentId
    source_type_key  = $sourceKey
    subject_id       = $subjectId
    event_lineage_id = $lineage
    event_version    = 1
    trace_id         = "conc-$i-" + [guid]::NewGuid().ToString().Substring(0, 8)
    occurred_at      = [datetime]::UtcNow.ToString("o")
    payload          = $payload
  }
  $body = $bodyObj | ConvertTo-Json -Depth 25

  for ($a = 1; $a -le $restAttempts; $a++) {
    try {
      $r = Invoke-RestMethod -Method Post -Uri "$baseUrl/events" -Headers $hdrs `
        -ContentType "application/json; charset=utf-8" -Body $body -TimeoutSec 120
      return [PSCustomObject]@{
        ok       = $true
        tick     = $i
        proof_id = $r.product_proof.proof_id
        version  = $r.identity.event_version
      }
    }
    catch {
      if ($a -eq $restAttempts) {
        return [PSCustomObject]@{
          ok    = $false
          tick  = $i
          error = $_.Exception.Message
        }
      }
      Start-Sleep -Milliseconds $restDelayMs
    }
  }
}

$results = @()

$cooldownMs = 0
if ($env:APROOF_LIVE_CONCURRENT_COOLDOWN_MS -match '^\d+$') {
  $cd = [int]$env:APROOF_LIVE_CONCURRENT_COOLDOWN_MS
  if ($cd -ge 0 -and $cd -le 5000) { $cooldownMs = $cd }
}

if ($maxParallel -le 1) {
  # Avoid Start-Job for sequential mode: child jobs were flaky against localhost / PGlite (ticks 2–n failing).
  foreach ($n in 1..$jobCount) {
    $results += Invoke-ConcurrentEventOnce -baseUrl $url -hdrs $headers -organizationId $org `
      -environmentId $envId -sourceKey $src -subjectId $sub -i $n
    if ($cooldownMs -gt 0) { Start-Sleep -Milliseconds $cooldownMs }
  }
}
else {
  for ($batchStart = 1; $batchStart -le $jobCount; $batchStart += $maxParallel) {
    $batchEnd = [Math]::Min($jobCount, $batchStart + $maxParallel - 1)
    $jobs = $batchStart..$batchEnd | ForEach-Object {
      $n = $_
      Start-Job -ScriptBlock {
        param($baseUrl, $hdrs, $organizationId, $environmentId, $sourceKey, $subjectId, $i, $attempts, $delayMs)

        $lineage = [guid]::NewGuid().ToString()
        $payload = @{
          record_id       = "live-conc-record-$i"
          host            = "conc"
          tick            = $i
          name            = "ehr-suite"
          policy          = @{ tags = @("allow_read"); version = "v1" }
          system          = @{ rails = @("ehr", "queue", "llm", "audit") }
          identity_access = @{
            actor_id = "actor-conc"; role = "operator"; principal_id = "actor-conc"
            granted_scopes = @("read:proofs"); scopes = @("read:proofs"); tenant_id = "tenant_demo"
            access_log_present = $true; token_valid = $true; token_expired = $false
          }
          operational     = @{ execution_status = "success"; latency_ms = 80; runtime_error = $null }
          model_identity  = @{ observed_model = "gpt-4.1-mini" }
          retrieval       = @{ retrieved_sources = @("db", "cache") }
          deterministic   = @{ observed_digest = "d-$i"; temperature = 0 }
          workflow        = @{ stage = "commit" }
          cross_system    = @{ observed_systems = @("ehr", "queue", "llm") }
          sync_id         = "sync-conc-$i"
          correlation_id  = "corr-conc-$i"
        }
        $bodyObj = @{
          organization_id  = $organizationId
          environment_id   = $environmentId
          source_type_key  = $sourceKey
          subject_id       = $subjectId
          event_lineage_id = $lineage
          event_version    = 1
          trace_id         = "conc-$i-" + [guid]::NewGuid().ToString().Substring(0, 8)
          occurred_at      = [datetime]::UtcNow.ToString("o")
          payload          = $payload
        }
        $body = $bodyObj | ConvertTo-Json -Depth 25

        for ($a = 1; $a -le $attempts; $a++) {
          try {
            $r = Invoke-RestMethod -Method Post -Uri "$baseUrl/events" -Headers $hdrs `
              -ContentType "application/json; charset=utf-8" -Body $body -TimeoutSec 120
            return [PSCustomObject]@{
              ok       = $true
              tick     = $i
              proof_id = $r.product_proof.proof_id
              version  = $r.identity.event_version
            }
          }
          catch {
            if ($a -eq $attempts) {
              return [PSCustomObject]@{
                ok    = $false
                tick  = $i
                error = $_.Exception.Message
              }
            }
            Start-Sleep -Milliseconds $delayMs
          }
        }
      } -ArgumentList $url, $headers, $org, $envId, $src, $sub, $n, $restAttempts, $restDelayMs
    }
    $results += $jobs | Receive-Job -Wait -AutoRemoveJob
  }
}

$results | Sort-Object tick | Format-Table -AutoSize
$results | Group-Object ok | Format-Table Name, Count -AutoSize

$bad = ($results | Where-Object { -not $_.ok }).Count
if ($bad -gt 0) {
  Write-Host "Some jobs failed: $bad" -ForegroundColor Yellow
  ($results | Where-Object { -not $_.ok } | Select-Object -First 5 tick, error | Format-Table -AutoSize | Out-String) | Write-Host
  exit 1
}
Write-Host "CONCURRENT: all OK" -ForegroundColor Green

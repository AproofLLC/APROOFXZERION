# Burst-test: 50× POST /events (unique lineages per tick).
# Prereq (from APROOF): npm run db:migrate; npm run seed; npm run seed:live
#   then npm run dev (default http://127.0.0.1:3000).
# Uses seeded subject SubjBurstLive (burst-live-001).

param(
  [string]$BaseUrl
)

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here "live-common.ps1")
if ($BaseUrl) { $script:LiveBaseUrl = $BaseUrl.TrimEnd('/') }

$subjectId = $script:SubjBurstLive

function Send-AproofEvent($tick, $payload) {
  $eventLineageId = [guid]::NewGuid().ToString()
  $traceId = "burst-$tick-$([guid]::NewGuid().ToString().Substring(0, 8))"
  $bodyObj = @{
    organization_id   = $script:LiveOrgId
    environment_id    = $script:LiveEnvId
    source_type_key   = $script:LiveSourceKey
    subject_id        = $subjectId
    event_lineage_id  = $eventLineageId
    event_version     = 1
    trace_id          = $traceId
    occurred_at       = (Get-Date).ToUniversalTime().ToString("o")
    payload           = $payload
  }
  $body = $bodyObj | ConvertTo-Json -Depth 20

  $attempts = 6
  if ($env:APROOF_SUBJECT_BURST_REST_ATTEMPTS -match '^\d+$') {
    $ba = [int]$env:APROOF_SUBJECT_BURST_REST_ATTEMPTS
    if ($ba -ge 1 -and $ba -le 20) { $attempts = $ba }
  }
  for ($attempt = 1; $attempt -le $attempts; $attempt++) {
    try {
      $res = Invoke-RestMethod -Method Post -Uri "$script:LiveBaseUrl/events" `
        -ContentType "application/json; charset=utf-8" `
        -Headers $script:LiveHeaders `
        -Body $body `
        -TimeoutSec 120

      $pp = $res.product_proof
      return [PSCustomObject]@{
        ok               = $true
        proof_id         = $pp.proof_id
        proof_status     = $pp.proof_status
        subject_id       = $subjectId
        contract_valid   = $pp.contract_valid
        angle_count      = $pp.angles.Count
        event_id         = $res.event_id
        event_lineage_id = $res.identity.event_lineage_id
        event_version    = $res.identity.event_version
        lineage_status   = $pp.lineage_status
      }
    }
    catch {
      if ($attempt -ge $attempts) {
        $detail = $_.Exception.Message
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
          $detail = $_.ErrorDetails.Message
        }
        return [PSCustomObject]@{
          ok    = $false
          error = $detail
        }
      }
      Start-Sleep -Milliseconds ([int](120 * $attempt))
    }
  }
  return [PSCustomObject]@{ ok = $false; error = "Unreachable: retries exhausted." }
}

$burstCooldownMs = 220
if ($env:APROOF_SUBJECT_BURST_COOLDOWN_MS -match '^\d+$') {
  $bc = [int]$env:APROOF_SUBJECT_BURST_COOLDOWN_MS
  if ($bc -ge 0 -and $bc -le 5000) { $burstCooldownMs = $bc }
}

$results = 1..50 | ForEach-Object {
  $n = $_
  $pl = Get-AproofCleanSystemPolicyPayload
  $pl["tick"] = $n
  $pl["host"] = "burst-client"
  $pl["operational"] = @{
    execution_status = "success"
    latency_ms       = (Get-Random -Minimum 40 -Maximum 180)
    runtime_error    = $null
  }
  $r = Send-AproofEvent -tick $n -payload $pl
  # Pace + backoff: bursts still stress PGlite; cooldown reduces dropped connections.
  Start-Sleep -Milliseconds $burstCooldownMs
  $r
}

$results | Format-Table -AutoSize
$results | Group-Object ok | Format-Table Name, Count -AutoSize

$okCount = ($results | Where-Object { $_.ok }).Count
if ($okCount -eq 50) {
  Write-Host "PASS: 50/50 events returned proofs." -ForegroundColor Green
}
else {
  Write-Host "FAIL: only $okCount / 50 succeeded." -ForegroundColor Red
  exit 1
}

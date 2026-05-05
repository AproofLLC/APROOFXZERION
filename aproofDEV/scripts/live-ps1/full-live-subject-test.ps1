# Runs a quick tour: control POST, same-state duplicate (422), version bump, RAW, list, burst.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here "live-common.ps1")

Assert-AproofServerReachable
# Preflight: ensure mapping_rules + real subject + baselines exist in the same DB as the running server.
Ensure-AproofLiveSeedData

function Post-Event([hashtable]$obj) {
  try {
    $json = $obj | ConvertTo-Json -Depth 25
    $raw = Invoke-RestMethod -Method Post "$script:LiveBaseUrl/events" -Headers $script:LiveHeaders `
      -ContentType "application/json; charset=utf-8" -Body $json
    return (Add-AproofShimProperties $raw)
  }
  catch {
    $msg = $_.Exception.Message
    $detail = $null
    if ($_.ErrorDetails.Message) { $detail = $_.ErrorDetails.Message }
    $isDup = $false
    if ($detail -and $detail -match 'duplicate_lineage_version_same_hash|duplicate_event_id_same_hash') { $isDup = $true }
    if (-not $isDup) {
      Write-Host "FAIL: $msg" -ForegroundColor Red
      if ($detail) { Write-Host $detail }
    } else {
      Write-Host "Expected duplicate response (422)." -ForegroundColor DarkGray
      if ($detail) { Write-Host $detail }
    }
    return $null
  }
}

Write-Host "=== CONTROL (baseline-complete system payload) ===" -ForegroundColor Cyan
$controlPayload = Get-AproofCleanSystemPolicyPayload
$c = Post-Event (New-AproofEventBody -SubjectId $script:SubjRealSystem -SourceTypeKey $script:LiveSourceKeyRealAction -Payload $controlPayload -EventLineageId ([guid]::NewGuid().ToString()) -EventVersion 1 -TraceId ("ctl-" + [guid]::NewGuid().ToString().Substring(0, 8)))
if ($c) { $c | ConvertTo-Json -Depth 8 }

Write-Host ''
Write-Host '=== SAME STATE expect 422 on second ===' -ForegroundColor Cyan
$lineReplay = [guid]::NewGuid().ToString()
$pl = Get-AproofCleanSystemPolicyPayload
$sharedTr = "live-replay-" + [guid]::NewGuid().ToString().Substring(0, 8)
$sharedOcc = [datetime]::UtcNow.ToString("o")
$s1 = Post-Event (New-AproofEventBody -SubjectId $script:SubjRealSystem -SourceTypeKey $script:LiveSourceKeyRealAction -Payload $pl -EventLineageId $lineReplay -EventVersion 1 -TraceId $sharedTr -OccurredAt $sharedOcc)
Start-Sleep -Milliseconds 200
$s2 = Post-Event (New-AproofEventBody -SubjectId $script:SubjRealSystem -SourceTypeKey $script:LiveSourceKeyRealAction -Payload $pl -EventLineageId $lineReplay -EventVersion 1 -TraceId $sharedTr -OccurredAt $sharedOcc)
if ($s1) { $s1.event | ConvertTo-Json -Depth 10 }
if ($s2) { $s2.event | ConvertTo-Json -Depth 10 } else { Write-Host 'Second call failed as expected for duplicate slot.' -ForegroundColor Green }

Write-Host ''
Write-Host '=== CHANGED STATE new version same lineage distinct logical payload ===' -ForegroundColor Cyan
$plV2 = @{} + $pl
$plV2["operational"] = @{ execution_status = "success"; latency_ms = 340; runtime_error = $null }
$v = Post-Event (New-AproofEventBody -SubjectId $script:SubjRealSystem -SourceTypeKey $script:LiveSourceKeyRealAction -Payload $plV2 -EventLineageId $lineReplay -EventVersion 2 -TraceId ("lr3-" + [guid]::NewGuid().ToString().Substring(0, 8)))
if ($v) { $v.event | ConvertTo-Json -Depth 10 }

Write-Host "`n=== READ AFTER WRITE ===" -ForegroundColor Cyan
if ($c -and $c.event_id) {
  try {
    $rd = Invoke-AproofGet "/proofs/$($c.event_id)"
    "event_id=$($rd.event_id) angles=$($rd.product_proof.angles.Count)"
  }
  catch { Write-Host $_.Exception.Message }
}

Write-Host "`n=== SUBJECT LIST (real-system) ===" -ForegroundColor Cyan
try {
  Invoke-AproofGet "/subjects/$($script:SubjRealSystem)/proofs?limit=10&offset=0" | ConvertTo-Json -Depth 12
}
catch { Write-Host $_.Exception.Message }

Write-Host "`n=== BURST (20, unique lineages) ===" -ForegroundColor Cyan
1..20 | ForEach-Object {
  $burstPl = Get-AproofCleanSystemPolicyPayload
  $burstPl["tick"] = $_
  $burstPl["deterministic"] = @{ observed_digest = "stable-demo-digest-v1"; temperature = 0 }
  $r = Post-Event (New-AproofEventBody -SubjectId $script:SubjBurstLive -Payload $burstPl -SourceTypeKey $script:LiveSourceKeyRealAction -EventLineageId ([guid]::NewGuid().ToString()) -EventVersion 1 -TraceId ("b$_-" + [guid]::NewGuid().ToString().Substring(0, 8)))
  if ($r) {
    Write-Host "OK $_ -> $($r.proof_id)"
  }
}

Write-Host "`nfull-live-subject-test done." -ForegroundColor Green

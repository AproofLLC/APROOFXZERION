# Same subject, same lineage, same version, same logical state (payload).
# AProof rejects the second POST with 422 NOT_PROOFABLE: duplicate_lineage_version_same_hash
# (that is the API's explicit same-state / replay signal).
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here "live-common.ps1")

$lineageId = [guid]::NewGuid().ToString()
# Same trace_id and occurred_at so logical_hash matches; second POST is true same-state replay.
$sharedTrace = "replay-shared-" + [guid]::NewGuid().ToString().Substring(0, 8)
$sharedOccurred = [datetime]::UtcNow.ToString("o")

$payload = Get-AproofCleanModelPolicyPayload
$payload["model_name"] = "reader-v2"
$payload["systems"] = @("inference", "storage")
$payload["deterministic"] = @{ observed_digest = "abc123"; temperature = 0 }

$body1 = New-AproofEventBody -SubjectId $script:SubjReplay -Payload $payload -EventLineageId $lineageId -EventVersion 1 -TraceId $sharedTrace -OccurredAt $sharedOccurred
$body2 = New-AproofEventBody -SubjectId $script:SubjReplay -Payload $payload -EventLineageId $lineageId -EventVersion 1 -TraceId $sharedTrace -OccurredAt $sharedOccurred

$r1 = Add-AproofShimProperties (Invoke-AproofPostEvent $body1)
Start-Sleep -Milliseconds 300

try {
  $r2 = Add-AproofShimProperties (Invoke-AproofPostEvent $body2)
}
catch {
  $r2 = $null
  $err = $_.ErrorDetails.Message
  if (-not $err) { $err = $_.Exception.Message }
  Write-Host 'Second POST expected duplicate for same lineage version and state:' -ForegroundColor Yellow
  Write-Host $err
}

Write-Host ''
Write-Host '=== First response 201, event projection ===' -ForegroundColor Cyan
$r1.event | ConvertTo-Json -Depth 10

if ($r2) {
  Write-Host ''
  Write-Host '=== Second response unexpected 201 ===' -ForegroundColor Red
  $r2.event | ConvertTo-Json -Depth 10
}
else {
  Write-Host ''
  Write-Host 'Second call returned error above; expect duplicate_lineage_version_same_hash or duplicate_event_id_same_hash.' -ForegroundColor Green
}

# Same lineage, version bump: logical_hash includes payload; v2 uses a slightly different payload
# (operational.latency_ms) so LINEAGE_VERSION_REPLAY_REJECTED does not fire. Artifact stays aligned via record_id.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here "live-common.ps1")

try {
  Assert-AproofServerReachable
} catch {
  Write-Error $_.Exception.Message
  exit 1
}

$lineageId = [guid]::NewGuid().ToString()
$payload = Get-AproofCleanServicePolicyPayload
$payload["service_name"] = "auth-gateway"
$payload["build"] = "1.0.0"
$payload["deterministic"] = @{ observed_digest = "same-build" }

try {
  $r1 = Add-AproofShimProperties (Invoke-AproofPostEvent (New-AproofEventBody -SubjectId $script:SubjVersion -Payload $payload -EventLineageId $lineageId -EventVersion 1 -TraceId ("ver-1-" + [guid]::NewGuid().ToString().Substring(0, 8))))
  # v2 must change logical_hash (payload-based); same payload + higher version is LINEAGE_VERSION_REPLAY_REJECTED.
  $payloadV2 = @{} + $payload
  $payloadV2["operational"] = @{ execution_status = "success"; latency_ms = 260 }
  $r2 = Add-AproofShimProperties (Invoke-AproofPostEvent (New-AproofEventBody -SubjectId $script:SubjVersion -Payload $payloadV2 -EventLineageId $lineageId -EventVersion 2 -TraceId ("ver-2-" + [guid]::NewGuid().ToString().Substring(0, 8))))
} catch {
  Write-Error "subject-version-bump failed: $($_.Exception.Message)"
  exit 1
}

Write-Host "=== First (v1) ===" -ForegroundColor Cyan
$r1.event | ConvertTo-Json -Depth 10

Write-Host "`n=== Second (v2, new state) ===" -ForegroundColor Cyan
$r2.event | ConvertTo-Json -Depth 10

if ($r1.event.event_lineage_id -ne $r2.event.event_lineage_id) {
  Write-Error "Lineage id mismatch."
  exit 1
}
if ($r2.event.event_version -le $r1.event.event_version) {
  Write-Error "Expected version to increase on second event."
  exit 1
}
if ($r2.event.lineage_status -notmatch "new_version|same_state") {
  Write-Error "Unexpected lineage_status: $($r2.event.lineage_status)"
  exit 1
}

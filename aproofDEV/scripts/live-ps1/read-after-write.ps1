# GET /proofs/:id uses canonical event_id (not policy proof UUID).
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here "live-common.ps1")

try {
  Assert-AproofServerReachable
} catch {
  Write-Error $_.Exception.Message
  exit 1
}

try {
  $rawPl = Get-AproofCleanSystemPolicyPayload
  $rawPl["system_name"] = "ehr-main"
  $rawPl["deterministic"] = @{ observed_digest = "stable"; temperature = 0 }
  $r = Add-AproofShimProperties (Invoke-AproofPostEvent (New-AproofEventBody -SubjectId $script:SubjRead -Payload $rawPl -EventLineageId ([guid]::NewGuid().ToString()) -EventVersion 1 -TraceId ("raw-" + [guid]::NewGuid().ToString().Substring(0, 8))))

  $eventId = $r.event_id
  if (-not $eventId) {
    throw "POST /events did not return event_id."
  }
  $read = Add-AproofShimProperties (Invoke-AproofGet "/proofs/$eventId")

  "WRITE angles: $($r.angles.Count)"
  "READ  angles: $($read.angles.Count)"
  "WRITE lineage: $($r.identity.event_lineage_id)"
  "READ  lineage: $($read.identity.event_lineage_id)"
  "WRITE version: $($r.identity.event_version)"
  "READ  version: $($read.identity.event_version)"
  "WRITE proof_digest: $($r.product_proof.proof_digest)"
  "READ  proof_digest: $($read.product_proof.proof_digest)"

  if ($r.angles.Count -ne $read.angles.Count) { Write-Error "Angle count drift"; exit 1 }
  if ($r.identity.event_lineage_id -ne $read.identity.event_lineage_id) { Write-Error "Lineage drift"; exit 1 }
  if ($r.identity.event_version -ne $read.identity.event_version) { Write-Error "Version drift"; exit 1 }
  if ($r.product_proof.proof_digest -ne $read.product_proof.proof_digest) {
    Write-Warning "proof_digest differs between write and GET (reconstruction path); angles/lineage/version still match."
  }
  Write-Host "READ-AFTER-WRITE: OK (core fields)" -ForegroundColor Green
}
catch {
  Write-Error "READ-AFTER-WRITE failed: $($_.Exception.Message)"
  exit 1
}

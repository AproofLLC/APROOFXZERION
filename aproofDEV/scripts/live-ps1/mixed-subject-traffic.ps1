# One event per rail type (subjects from seed:live).
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here "live-common.ps1")

try {
  Assert-AproofServerReachable
} catch {
  Write-Error $_.Exception.Message
  exit 1
}

$events = @(
  @{ subject_id = $script:SubjM1; subject_type = "model"; payload = (Get-AproofCleanModelPolicyPayload) },
  @{ subject_id = $script:SubjA1; subject_type = "agent"; payload = (Get-AproofCleanAgentPolicyPayload) },
  @{ subject_id = $script:SubjS1; subject_type = "service"; payload = (Get-AproofCleanServicePolicyPayload) },
  @{ subject_id = $script:SubjE1; subject_type = "endpoint"; payload = (Get-AproofCleanEndpointPolicyPayload) },
  @{ subject_id = $script:SubjSys1; subject_type = "system"; payload = (Get-AproofCleanSystemPolicyPayload) }
)

 $failed = $false
foreach ($e in $events) {
  $lineage = [guid]::NewGuid().ToString()
  $body = New-AproofEventBody -SubjectId $e.subject_id -Payload $e.payload -EventLineageId $lineage -EventVersion 1 `
    -TraceId ("mix-" + $e.subject_type + "-" + [guid]::NewGuid().ToString().Substring(0, 8))
  try {
    $r = Add-AproofShimProperties (Invoke-AproofPostEvent $body)
    "$($e.subject_type): ok contract=$($r.contract_valid) angles=$($r.angles.Count) version=$($r.event.event_version) lineage=$($r.event.lineage_status)"
  }
  catch {
    "$($e.subject_type): FAIL -> $($_.Exception.Message)"
    if ($_.ErrorDetails.Message) { "  detail: $($_.ErrorDetails.Message)" }
    $failed = $true
  }
}

if ($failed) {
  exit 1
}

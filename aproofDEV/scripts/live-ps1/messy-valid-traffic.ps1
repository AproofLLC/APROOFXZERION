# INTENTIONALLY messy / thin payloads — expect flagged proofs, missing baselines, or noisy angles.
# This script validates the API still accepts odd JSON; do not treat output as baseline defects.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here "live-common.ps1")

$payloads = @(
  @{ systems = @("ehr"); digest = "a"; extra = @{ noise = 1 } },
  @{ systems = @("ehr", "queue"); digest = "b"; unknown_field = "zzz" },
  @{ systems = @(); digest = "c"; latency_ms = 9999 },
  @{ systems = @("llm", "db"); digest = $null; model = "reader" },
  @{ systems = @("svc"); nested = @{ x = @{ y = @{ z = 1 } } } }
)

foreach ($p in $payloads) {
  $body = New-AproofEventBody -SubjectId $script:SubjMessy -Payload $p -EventLineageId ([guid]::NewGuid().ToString()) -EventVersion 1 `
    -TraceId ("messy-" + [guid]::NewGuid().ToString().Substring(0, 8))
  try {
    $r = Add-AproofShimProperties (Invoke-AproofPostEvent $body)
    "OK -> proof=$($r.proof_id) angles=$($r.angles.Count) status=$($r.product_proof.proof_status)"
  }
  catch {
    $d = $_.ErrorDetails.Message
    if (-not $d) { $d = $_.Exception.Message }
    "FAIL -> $d"
  }
}

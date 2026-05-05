param(
  [string]$BaseUrl,
  [int]$Seconds = 120
)

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here "stress-common.ps1")
Set-StressBaseUrl $BaseUrl

$end = (Get-Date).AddSeconds($Seconds)
$ok = 0
$fail = 0

while ((Get-Date) -lt $end) {
  $tick = Get-Random -Minimum 1 -Maximum 1000000
  $body = New-StressEventBody -SubjectId $script:StressSoak -Payload @{
    host    = "soak"
    digest  = "d-$tick"
    policy  = @{ tags = @("allow_read") }
    systems = @("ehr", "queue", "llm")
    tick    = $tick
  } -EventLineageId ([guid]::NewGuid().ToString()) -EventVersion 1 `
    -TraceId ("soak-" + [guid]::NewGuid().ToString()) -OccurredAt ([datetime]::UtcNow.ToString("o"))

  $json = $body | ConvertTo-Json -Depth 25
  try {
    $r = Invoke-RestMethod -Uri "$script:LiveBaseUrl/events" -Method Post `
      -Headers $script:LiveHeaders -ContentType "application/json; charset=utf-8" -Body $json
    if ($r.product_proof.contract_valid -and $r.product_proof.angles.Count -eq 7) { $ok++ } else { $fail++ }
  }
  catch {
    $fail++
  }

  Start-Sleep -Milliseconds 250
}

"SOAK COMPLETE"
"OK   = $ok"
"FAIL = $fail"

param(
  [string]$BaseUrl
)

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here "stress-common.ps1")
Set-StressBaseUrl $BaseUrl

$lineageId = [guid]::NewGuid().ToString()

function Post-Event([int]$tick) {
  $payload = @{
    host    = "version-race"
    build   = "svc-$tick"
    digest  = "digest-$tick"
    policy  = @{ tags = @("allow_read") }
    systems = @("gateway", "db")
    tick    = $tick
  }
  $body = New-StressEventBody -SubjectId $script:StressVersion -Payload $payload `
    -EventLineageId $lineageId -EventVersion $tick `
    -TraceId ("trace-vr-" + $tick) -OccurredAt ([datetime]::UtcNow.ToString("o"))

  $json = $body | ConvertTo-Json -Depth 25
  try {
    $r = Invoke-RestMethod -Uri "$script:LiveBaseUrl/events" -Method Post `
      -Headers $script:LiveHeaders -ContentType "application/json; charset=utf-8" -Body $json
    $id = $r.identity
    [PSCustomObject]@{
      ok      = $true
      tick    = $tick
      lineage = $id.event_lineage_id
      version = $id.event_version
      status  = $r.product_proof.lineage_status
      reason  = $r.product_proof.lineage_reason
    }
  }
  catch {
    [PSCustomObject]@{
      ok    = $false
      tick  = $tick
      error = $_.Exception.Message
    }
  }
}

$results = 1..30 | ForEach-Object { Post-Event $_ }
$results | Sort-Object tick | Format-Table -AutoSize

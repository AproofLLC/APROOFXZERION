param(
  [string]$BaseUrl
)

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here "stress-common.ps1")
Set-StressBaseUrl $BaseUrl

function Post-Event([hashtable]$obj) {
  $json = $obj | ConvertTo-Json -Depth 25
  try {
    $r = Invoke-RestMethod -Uri "$script:LiveBaseUrl/events" -Method Post `
      -Headers $script:LiveHeaders -ContentType "application/json; charset=utf-8" -Body $json
    $id = $r.identity
    [PSCustomObject]@{
      ok       = $true
      code     = 201
      proof_id = $r.product_proof.proof_id
      event_id = $r.event_id
      lineage  = $id.event_lineage_id
      version  = $id.event_version
      status   = $r.product_proof.lineage_status
    }
  }
  catch {
    $resp = $_.Exception.Response
    $code = if ($resp) { [int]$resp.StatusCode } else { -1 }
    $body = $null
    try {
      if ($resp) {
        $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $body = $reader.ReadToEnd()
      }
    }
    catch {}
    [PSCustomObject]@{
      ok    = $false
      code  = $code
      error = $_.Exception.Message
      body  = $body
    }
  }
}

$lineageId = [guid]::NewGuid().ToString()
$traceId = "trace-dup-flood"
$occurredAt = "2026-04-07T12:00:00.000Z"

$payload = @{
  host    = "duplicate-flood"
  digest  = "same"
  name    = "hot-subject"
  policy  = @{ tags = @("allow_read") }
  systems = @("ehr", "queue", "llm")
}

$payloadHt = New-StressEventBody -SubjectId $script:StressDup -Payload $payload `
  -EventLineageId $lineageId -EventVersion 1 -TraceId $traceId -OccurredAt $occurredAt

$results = 1..50 | ForEach-Object { Post-Event $payloadHt }
$results | Format-Table -AutoSize
$results | Group-Object ok, code | Sort-Object Count -Descending | Format-Table Count, Name -AutoSize

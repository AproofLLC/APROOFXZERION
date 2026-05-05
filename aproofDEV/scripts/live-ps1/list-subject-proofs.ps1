$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here "live-common.ps1")

$subjectId = $script:SubjList

1..5 | ForEach-Object {
  $n = $_
  $body = New-AproofEventBody -SubjectId $subjectId -Payload @{
    route = "/v1/orders"
    tick = $n
    systems = @("api", "orders-db")
  } -EventLineageId ([guid]::NewGuid().ToString()) -EventVersion 1 -TraceId ("list-$n-" + [guid]::NewGuid().ToString().Substring(0, 8))
  Invoke-AproofPostEvent $body | Out-Null
}

Invoke-AproofGet "/subjects/$subjectId/proofs?limit=10&offset=0" | ConvertTo-Json -Depth 20

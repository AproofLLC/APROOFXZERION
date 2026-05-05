param(
  [string]$BaseUrl
)

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here "stress-common.ps1")
Set-StressBaseUrl $BaseUrl

$subjectId = $script:StressPageChurn

1..40 | ForEach-Object {
  $body = New-StressEventBody -SubjectId $subjectId -Payload @{
    host   = "page-churn"
    route  = "/v1/orders"
    digest = "d-$_"
    policy = @{ tags = @("allow_read") }
    systems = @("api", "orders-db")
    tick   = $_
  } -EventLineageId ([guid]::NewGuid().ToString()) -EventVersion 1 `
    -TraceId ("page-" + $_) -OccurredAt ([datetime]::UtcNow.ToString("o"))

  $json = $body | ConvertTo-Json -Depth 25
  Invoke-RestMethod -Uri "$script:LiveBaseUrl/events" -Method Post `
    -Headers $script:LiveHeaders -ContentType "application/json; charset=utf-8" -Body $json | Out-Null
}

$page1 = Invoke-RestMethod -Uri "$script:LiveBaseUrl/subjects/$subjectId/proofs?limit=10&offset=0" `
  -Headers $script:LiveHeaders -Method Get
$page2 = Invoke-RestMethod -Uri "$script:LiveBaseUrl/subjects/$subjectId/proofs?limit=10&offset=10" `
  -Headers $script:LiveHeaders -Method Get
$page3 = Invoke-RestMethod -Uri "$script:LiveBaseUrl/subjects/$subjectId/proofs?limit=10&offset=20" `
  -Headers $script:LiveHeaders -Method Get
$page4 = Invoke-RestMethod -Uri "$script:LiveBaseUrl/subjects/$subjectId/proofs?limit=10&offset=30" `
  -Headers $script:LiveHeaders -Method Get

"Page1: $($page1.items.Count)"
"Page2: $($page2.items.Count)"
"Page3: $($page3.items.Count)"
"Page4: $($page4.items.Count)"
"Total: $($page1.page.total)"

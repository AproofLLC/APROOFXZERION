param(
  [string]$BaseUrl
)

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here "stress-common.ps1")
Set-StressBaseUrl $BaseUrl

$types = @("model", "agent", "service", "endpoint", "system")
$results = [System.Collections.ArrayList]@()

foreach ($t in $types) {
  1..20 | ForEach-Object {
    $subjectId = Get-MatrixSubjectId -Rail $t -Index $_
    $body = New-StressEventBody -SubjectId $subjectId -Payload @{
      host    = "matrix"
      digest  = "$t-$_"
      policy  = @{ tags = @("allow_read") }
      systems = @("sys-a", "sys-b")
      tick    = $_
    } -EventLineageId ([guid]::NewGuid().ToString()) -EventVersion 1 `
      -TraceId ("mx-$t-$_") -OccurredAt ([datetime]::UtcNow.ToString("o"))

    $json = $body | ConvertTo-Json -Depth 25
    try {
      $r = Invoke-RestMethod -Uri "$script:LiveBaseUrl/events" -Method Post `
        -Headers $script:LiveHeaders -ContentType "application/json; charset=utf-8" -Body $json
      [void]$results.Add([PSCustomObject]@{
          subject_type   = $t
          ok             = $true
          angles         = $r.product_proof.angles.Count
          contract_valid = $r.product_proof.contract_valid
        })
    }
    catch {
      [void]$results.Add([PSCustomObject]@{
          subject_type = $t
          ok           = $false
          error        = $_.Exception.Message
        })
    }
  }
}

$results | Group-Object subject_type, ok | Format-Table Count, Name -AutoSize

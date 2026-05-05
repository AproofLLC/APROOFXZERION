param(
  [string]$BaseUrl
)

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here "stress-common.ps1")
Set-StressBaseUrl $BaseUrl

function Send([hashtable]$obj) {
  $json = $obj | ConvertTo-Json -Depth 35
  try {
    $r = Invoke-RestMethod -Uri "$script:LiveBaseUrl/events" -Method Post `
      -Headers $script:LiveHeaders -ContentType "application/json; charset=utf-8" -Body $json
    $id = $r.identity
    [PSCustomObject]@{
      ok             = $true
      subject        = $obj.subject_id
      proof_id       = $r.product_proof.proof_id
      contract_valid = $r.product_proof.contract_valid
      angles         = $r.product_proof.angles.Count
      version        = $id.event_version
    }
  }
  catch {
    $resp = $_.Exception.Response
    $code = if ($resp) { [int]$resp.StatusCode } else { -1 }
    [PSCustomObject]@{
      ok      = $false
      subject = $obj.subject_id
      code    = $code
      error   = $_.Exception.Message
    }
  }
}

function One-Off([string]$subjectId, [hashtable]$payload) {
  $h = @{
    organization_id  = $script:LiveOrgId
    environment_id   = $script:LiveEnvId
    source_type_key  = $script:LiveSourceKey
    subject_id       = $subjectId
    event_lineage_id = [guid]::NewGuid().ToString()
    event_version    = 1
    trace_id         = "chaos-" + [guid]::NewGuid().ToString()
    occurred_at      = [datetime]::UtcNow.ToString("o")
    payload          = $payload
  }
  Send $h
}

$cases = @(
  @{ sid = $script:StressChaosModel; pl = @{ host = "chaos"; digest = "a"; policy = @{ tags = @("allow_read") }; systems = @("inference") } },
  @{ sid = $script:StressChaosAgent; pl = @{ host = "chaos"; tools = @("search", "db"); policy = @{ tags = @("allow_read") }; systems = @("agent", "db") } },
  @{ sid = $script:StressChaosEndpoint; pl = @{ host = "chaos"; route = "/v1/chat"; policy = @{ tags = @("allow_read") }; systems = @("api", "svc") } },
  @{ sid = $script:StressChaosBad1; pl = @{ host = "chaos"; digest = "bad" } },
  @{ sid = $script:StressChaosSys1; pl = @{} },
  @{ sid = $script:StressChaosSys1; pl = @{ host = "chaos"; digest = "x"; policy = @{ tags = @("allow_read") }; systems = @() } },
  @{ sid = $script:StressChaosSys2; pl = @{ host = "chaos"; digest = "x"; policy = @{ tags = @("allow_read") }; systems = @("ehr", "queue", "llm"); nested = @{ a = @{ b = @{ c = 1 } } } } }
)

$results = 1..100 | ForEach-Object {
  $c = Get-Random -InputObject $cases
  One-Off $c.sid $c.pl
}

$results | Format-Table -AutoSize
$results | Group-Object ok, subject, code | Sort-Object Count -Descending | Format-Table Count, Name -AutoSize

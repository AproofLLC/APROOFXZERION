param(
  [string]$BaseUrl
)

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here "stress-common.ps1")
Set-StressBaseUrl $BaseUrl

$base = $script:LiveBaseUrl
$org = $script:LiveOrgId
$env = $script:LiveEnvId
$key = $script:LiveApiKey
$src = $script:LiveSourceKey
$sub = $script:StressDupConcurrent
$sharedLineage = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
$sharedTrace = "dup-conc-shared"
$sharedOccurred = "2026-04-07T18:00:00.000Z"

$jobs = 1..20 | ForEach-Object {
  Start-Job -ScriptBlock {
    param($base, $orgId, $envId, $apiKey, $sourceKey, $subjectId, $lineageId, $traceId, $occurredIso)
    $headers = @{ "x-api-key" = $apiKey }
    $body = @{
      organization_id  = $orgId
      environment_id   = $envId
      source_type_key  = $sourceKey
      subject_id       = $subjectId
      event_lineage_id = $lineageId
      event_version    = 1
      trace_id         = $traceId
      occurred_at      = $occurredIso
      payload          = @{
        host    = "dup-concurrent"
        digest  = "same"
        policy  = @{ tags = @("allow_read") }
        systems = @("inference")
      }
    } | ConvertTo-Json -Depth 25
    try {
      $r = Invoke-RestMethod -Uri "$base/events" -Method Post -Headers $headers `
        -ContentType "application/json; charset=utf-8" -Body $body
      [PSCustomObject]@{ ok = $true; code = 201; proof_id = $r.product_proof.proof_id }
    }
    catch {
      $resp = $_.Exception.Response
      $code = if ($resp) { [int]$resp.StatusCode } else { -1 }
      [PSCustomObject]@{ ok = $false; code = $code; error = $_.Exception.Message }
    }
  } -ArgumentList $base, $org, $env, $key, $src, $sub, $sharedLineage, $sharedTrace, $sharedOccurred
}

$results = $jobs | Receive-Job -Wait -AutoRemoveJob
$results | Format-Table -AutoSize
$results | Group-Object ok, code | Format-Table Count, Name -AutoSize

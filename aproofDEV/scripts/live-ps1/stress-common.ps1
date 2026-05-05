# Dot-source from stress-*.ps1 in this folder:
#   . (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "stress-common.ps1")
# Requires: npm run seed && npm run seed:live (includes stress subjects — see seed-live-test-subjects.ts)

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here "live-common.ps1")

$script:StressDup = "55555555-5555-4555-8555-000000000501"
$script:StressVersion = "55555555-5555-4555-8555-000000000502"
$script:StressChaosModel = "55555555-5555-4555-8555-000000000511"
$script:StressChaosAgent = "55555555-5555-4555-8555-000000000512"
$script:StressChaosEndpoint = "55555555-5555-4555-8555-000000000513"
$script:StressChaosBad1 = "55555555-5555-4555-8555-000000000514"
$script:StressChaosSys1 = "55555555-5555-4555-8555-000000000516"
$script:StressChaosSys2 = "55555555-5555-4555-8555-000000000517"
$script:StressRw = "55555555-5555-4555-8555-000000000521"
$script:StressSoak = "55555555-5555-4555-8555-000000000522"
$script:StressPageChurn = "55555555-5555-4555-8555-000000000523"
$script:StressDigest = "55555555-5555-4555-8555-000000000524"
$script:StressDupConcurrent = "55555555-5555-4555-8555-000000000525"

function Set-StressBaseUrl {
  param([string]$BaseUrl)
  if ($BaseUrl) { $script:LiveBaseUrl = $BaseUrl.TrimEnd('/') }
}

function New-StressEventBody {
  param(
    [Parameter(Mandatory)][string]$SubjectId,
    [Parameter(Mandatory)][hashtable]$Payload,
    [string]$EventLineageId,
    [int]$EventVersion = 1,
    [string]$TraceId,
    [string]$OccurredAt
  )
  New-AproofEventBody -SubjectId $SubjectId -Payload $Payload -EventLineageId $EventLineageId `
    -EventVersion $EventVersion -TraceId $TraceId -OccurredAt $OccurredAt
}

function Invoke-StressPostEvent {
  param([hashtable]$BodyHashtable)
  $json = $BodyHashtable | ConvertTo-Json -Depth 30
  Invoke-RestMethod -Uri "$script:LiveBaseUrl/events" -Method Post `
    -Headers $script:LiveHeaders -ContentType "application/json; charset=utf-8" -Body $json
}

function Get-MatrixSubjectId {
  param(
    [ValidateSet("model", "agent", "service", "endpoint", "system")][string]$Rail,
    [int]$Index
  )
  $bases = @{ model = 601; agent = 621; service = 641; endpoint = 661; system = 681 }
  $n = $bases[$Rail] + $Index - 1
  $hex = ([uint32]$n).ToString("x").PadLeft(12, "0")
  "55555555-5555-4555-8555-$hex"
}

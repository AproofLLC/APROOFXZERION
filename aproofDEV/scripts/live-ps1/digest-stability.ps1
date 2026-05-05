# Proof digest must match: POST product_proof.proof_digest == GET /proofs/{proof_id} (twice).
# Prereq: demo seed + seed:live on the same DB as server (APROOF_DB_MODE / PGLITE_DATA_DIR / DATABASE_URL).
# Uses pre-seeded live subject to avoid launching a second PGlite writer process while server is running.

param(
  [string]$BaseUrl
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

. (Join-Path $here "live-common.ps1")
if ($BaseUrl) { $script:LiveBaseUrl = $BaseUrl.TrimEnd('/') }

$subjectId = $script:SubjLive001
Write-Host "[digest-stability] subject_id: $subjectId"

$body = New-AproofEventBody -SubjectId $subjectId -Payload @{
  host    = "digest-stability"
  digest  = "stable"
  name    = "ehr-suite"
  policy  = @{ tags = @("allow_read") }
  systems = @("ehr", "queue", "llm")
} -EventLineageId ([guid]::NewGuid().ToString()) -EventVersion 1 `
  -TraceId "digest-stab-1" -OccurredAt "2026-04-07T15:00:00.000Z"

$json = $body | ConvertTo-Json -Depth 25
try {
  $write = Invoke-RestMethod -Uri "$script:LiveBaseUrl/events" -Method Post `
    -Headers $script:LiveHeaders -ContentType "application/json; charset=utf-8" -Body $json
}
catch {
  Write-Host "POST /events failed: $($_.Exception.Message)" -ForegroundColor Red
  Write-LiveHarnessDbContext
  Write-Host "[digest-stability] subject_id used in POST: $subjectId"
  if ($_.ErrorDetails.Message) { Write-Host "  body: $($_.ErrorDetails.Message)" -ForegroundColor DarkYellow }
  throw
}

$proofId = $write.product_proof.proof_id
if (-not $proofId) {
  Write-Host "FAIL: POST did not return product_proof.proof_id" -ForegroundColor Red
  exit 1
}

$read1 = Invoke-RestMethod -Uri "$script:LiveBaseUrl/proofs/$proofId" `
  -Headers $script:LiveHeaders -Method Get
$read2 = Invoke-RestMethod -Uri "$script:LiveBaseUrl/proofs/$proofId" `
  -Headers $script:LiveHeaders -Method Get

$w = $write.product_proof.proof_digest
$r1 = $read1.product_proof.proof_digest
$r2 = $read2.product_proof.proof_digest

"WRITE digest: $w"
"READ1 digest: $r1"
"READ2 digest: $r2"

if ($w -eq $r1 -and $r1 -eq $r2) {
  Write-Host "PASS: write == read1 == read2" -ForegroundColor Green
  exit 0
}

Write-Host "FAIL: digest mismatch" -ForegroundColor Red
$debug = [ordered]@{
  write_digest = $w
  read1_digest = $r1
  read2_digest = $r2
  proof_id     = $proofId
  event_id     = $write.event_id
  subject_id   = $subjectId
  identity_write = @{
    event_lineage_id = $write.identity.event_lineage_id
    event_version    = $write.identity.event_version
    canonical_hash   = $write.identity.canonical_hash
  }
  identity_read1 = @{
    event_lineage_id = $read1.identity.event_lineage_id
    event_version    = $read1.identity.event_version
    canonical_hash   = $read1.identity.canonical_hash
  }
}
($debug | ConvertTo-Json -Depth 12)
exit 1

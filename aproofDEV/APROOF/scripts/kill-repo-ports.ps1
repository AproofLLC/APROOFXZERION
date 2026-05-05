# Kill any process listening on common local dev ports for this stack.
# Run from the APROOF directory: npm run kill:ports
$ErrorActionPreference = "SilentlyContinue"
$ports = @(3000, 3001, 3101, 4173)
$stopped = New-Object System.Collections.Generic.List[string]

foreach ($port in $ports) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if (-not $conns) { continue }
  $seenPid = @{}
  foreach ($c in $conns) {
    $procId = $c.OwningProcess
    if ($seenPid[$procId]) { continue }
    $seenPid[$procId] = $true
    $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
    $name = if ($p) { $p.ProcessName } else { "unknown" }
    Write-Host "Port $port : PID $procId ($name)"
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    $stopped.Add("${port}:$procId") | Out-Null
  }
}

if ($stopped.Count -eq 0) {
  Write-Host "No listeners on ports $($ports -join ', ')." -ForegroundColor Yellow
} else {
  Write-Host "Stopped $($stopped.Count) listener(s): $($stopped -join ', ')" -ForegroundColor Green
}

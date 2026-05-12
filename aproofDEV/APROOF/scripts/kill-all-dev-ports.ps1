# Kill listeners on common dev ports (API, Vite dev/preview, debug).
$ErrorActionPreference = "SilentlyContinue"
# Stack + Vite fallbacks + preview + Node inspect (+ common alternate API ports).
# Omit 8080: often used by unrelated local httpd; repo docker-compose example maps web there.
$ports = @(
  3000, 3001, 3005, 3040, 3101, 4173, 4273,
  5173, 5174, 5175, 5176, 5177, 5178,
  5273, 5274, 5275, 5276, 5277, 5278,
  9229
)
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

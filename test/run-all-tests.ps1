param(
  [string]$Scenario = "all",
  [int]$Port = 8000,
  [int]$Timeout = 120000
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ArcaneGaunt Test Runner" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Scenario: $Scenario"
Write-Host "Port:     $Port"
Write-Host "Timeout:  $($Timeout / 1000)s"
Write-Host ""

# Check dependencies
if (-not (Test-Path "$Root\node_modules\electron\dist\electron.exe")) {
  Write-Host "ERROR: Electron not found. Run 'npm install' first." -ForegroundColor Red
  exit 1
}

# Run the Node.js test runner
$env:ARCANE_SMOKE_SCENARIO = $Scenario
$env:ARCANE_SMOKE_PORT = $Port
$env:ARCANE_SMOKE_TIMEOUT = $Timeout

& "$Root\node_modules\electron\dist\electron.exe" "$PSScriptRoot\electron-smoke.cjs"
$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
  Write-Host "All smoke tests passed!" -ForegroundColor Green
} else {
  Write-Host "Some smoke tests failed (exit code: $exitCode)." -ForegroundColor Red
}

exit $exitCode

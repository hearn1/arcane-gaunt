$repoRoot = Split-Path -Parent $PSScriptRoot
$steampipeDir = Join-Path $repoRoot "steampipe"

Write-Host "=== ArcaneGaunt Steam Upload Prep ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Step 1: Packaging Windows build..." -ForegroundColor Yellow

Push-Location $repoRoot
try {
    npm run pack:win
    $packOk = $LASTEXITCODE -eq 0
} finally {
    Pop-Location
}

if (-not $packOk) {
    Write-Host "FAILED: npm run pack:win did not complete successfully." -ForegroundColor Red
    exit 1
}

Write-Host "Packaging complete." -ForegroundColor Green
Write-Host ""

$exePath = Join-Path $repoRoot "dist\win-unpacked\ArcaneGaunt.exe"
if (-not (Test-Path $exePath)) {
    Write-Host "WARNING: Expected $exePath not found. The pack may have failed." -ForegroundColor Red
}

Write-Host "Step 2: Ready for SteamCMD upload" -ForegroundColor Yellow
Write-Host ""
Write-Host "Run the following command (with substituted placeholders):" -ForegroundColor Cyan
Write-Host ""
Write-Host "  steamcmd +login <user> +run_app_build ""$steampipeDir\app_build_arcane.vdf"" +quit" -ForegroundColor White
Write-Host ""
Write-Host "Don't forget to replace __APPID__ and __DEPOTID__ in:" -ForegroundColor Yellow
Write-Host "  $steampipeDir\app_build_arcane.vdf" -ForegroundColor Gray
Write-Host "  $steampipeDir\depot_build_arcane_windows.vdf" -ForegroundColor Gray
Write-Host ""
Write-Host "See steampipe/README.md for detailed instructions." -ForegroundColor Cyan

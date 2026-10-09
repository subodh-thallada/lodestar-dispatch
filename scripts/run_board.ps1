# Starts the provided Freight Challenge load board (git submodule in ./board) on port 8000.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\run_board.ps1 [-Port 8000] [-IntervalSeconds 60]
param(
    [int]$Port = 8000,
    [double]$IntervalSeconds = 60
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$py = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) { $py = "python" }
if (-not (Test-Path (Join-Path $root "board\app\main.py"))) {
    Write-Host "board/ is empty - run: git submodule update --init" -ForegroundColor Red
    exit 1
}
Set-Location (Join-Path $root "board")
$env:ORDER_INTERVAL_SECONDS = "$IntervalSeconds"
& $py -m uvicorn app.main:app --host 127.0.0.1 --port $Port

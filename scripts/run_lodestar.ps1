# Starts the Lodestar backend on port 8100. If frontend/dist exists it is served on the same port.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\run_lodestar.ps1 [-Port 8100] [-Board http://127.0.0.1:8000]
param(
    [int]$Port = 8100,
    [string]$Board = "http://127.0.0.1:8000"
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$py = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) { $py = "python" }
Set-Location (Join-Path $root "backend")
$env:LODESTAR_BOARD_URL = $Board
& $py -m uvicorn lodestar.main:app --host 127.0.0.1 --port $Port

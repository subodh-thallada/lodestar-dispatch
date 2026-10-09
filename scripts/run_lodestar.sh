#!/usr/bin/env bash
# Starts the Lodestar backend on port 8100 (serves frontend/dist on the same port if built).
# Usage: scripts/run_lodestar.sh [port] [board_url]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${1:-8100}"
export LODESTAR_BOARD_URL="${2:-http://127.0.0.1:8000}"
PY="$ROOT/.venv/bin/python"; [ -x "$PY" ] || PY=python3
cd "$ROOT/backend"
exec "$PY" -m uvicorn lodestar.main:app --host 127.0.0.1 --port "$PORT"

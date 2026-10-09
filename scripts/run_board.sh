#!/usr/bin/env bash
# Starts the provided Freight Challenge load board (git submodule in ./board) on port 8000.
# Usage: scripts/run_board.sh [port] [order_interval_seconds]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${1:-8000}"
export ORDER_INTERVAL_SECONDS="${2:-60}"
PY="$ROOT/.venv/bin/python"; [ -x "$PY" ] || PY=python3
[ -f "$ROOT/board/app/main.py" ] || { echo "board/ is empty - run: git submodule update --init" >&2; exit 1; }
cd "$ROOT/board"
exec "$PY" -m uvicorn app.main:app --host 127.0.0.1 --port "$PORT"

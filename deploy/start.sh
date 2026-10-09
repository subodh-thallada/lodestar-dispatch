#!/bin/sh
# Runs the load board (internal :8000) and Lodestar (public :$PORT) in one container.
set -e
cd /app/board
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 &
BOARD_PID=$!

cd /app/backend
python -m uvicorn lodestar.main:app --host 0.0.0.0 --port "${PORT:-8100}" --proxy-headers --forwarded-allow-ips="*" &
LODESTAR_PID=$!

trap 'kill $BOARD_PID $LODESTAR_PID 2>/dev/null' TERM INT
wait $LODESTAR_PID
kill $BOARD_PID 2>/dev/null || true

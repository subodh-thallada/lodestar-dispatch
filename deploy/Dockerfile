# All-in-one image for hosted demos: the provided load board and Lodestar (backend +
# built console) run in one container so a single small service can host the whole
# challenge. Build context is the repository root (board/ is a git submodule).
#
#   docker build -f deploy/Dockerfile -t lodestar .
#   docker run -p 8100:8100 lodestar          # console + API on :8100, board on :8000 inside
#
# PORT (default 8100) is what Lodestar listens on; the board stays on 8000 internally and
# is also reachable at /board/* through Lodestar for inspection.

FROM node:20-alpine AS ui
WORKDIR /ui
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY board/requirements.txt ./board/requirements.txt
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r board/requirements.txt -r backend/requirements.txt

COPY board/ ./board/
COPY backend/ ./backend/
COPY --from=ui /ui/dist ./frontend/dist
COPY deploy/start.sh ./deploy/start.sh
RUN chmod +x ./deploy/start.sh

ENV PYTHONUNBUFFERED=1 \
    ORDER_INTERVAL_SECONDS=20 \
    LODESTAR_BOARD_URL=http://127.0.0.1:8000 \
    PORT=8100

EXPOSE 8100
CMD ["./deploy/start.sh"]

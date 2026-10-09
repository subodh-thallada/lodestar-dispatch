import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from lodestar.api.routes import router
from lodestar.board.client import BoardClient
from lodestar.config import BASE_DIR, settings
from lodestar.db import init_db
from lodestar.engine.autopilot import autopilot_loop
from lodestar.ingest.worker import IngestWorker
from lodestar.state import state

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logging.getLogger("websockets").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)

FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    state.board = BoardClient()
    worker = IngestWorker(state.board)
    app.state.worker = worker
    ingest_task = asyncio.create_task(worker.run())
    autopilot_task = asyncio.create_task(autopilot_loop(state.board, worker.stop, worker.ready))
    try:
        yield
    finally:
        worker.stop.set()
        for t in (ingest_task, autopilot_task):
            t.cancel()
        await asyncio.gather(ingest_task, autopilot_task, return_exceptions=True)
        await state.board.close()


app = FastAPI(
    title=settings.app_name,
    description="Dispatch brain for the Freight Challenge load board: ingestion, temporal locks, margin-aware booking, auto-pilot.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(router)


if FRONTEND_DIST.exists():  # single-process deployment: serve the built UI
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        target = FRONTEND_DIST / path
        if path and target.is_file():
            return FileResponse(target)
        return FileResponse(FRONTEND_DIST / "index.html")

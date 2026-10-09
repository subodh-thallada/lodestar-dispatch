"""Real-time ingestion: board WebSocket (primary) + polling (fallback / reconciliation).

Why both: the WebSocket tells us *immediately* about new loads, but the board also
expires loads, resolves bids and completes deliveries on its own clock and only emits a
coarse `lifecycle` tick for those. Polling `/orders?status=all` and `/fleet/snapshot`
every few seconds reconciles everything, survives board restarts, and lets Lodestar run
even if the socket is blocked.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path

import websockets
from sqlalchemy import delete, select

from lodestar.board.client import BoardClient, BoardError
from lodestar.clock import clock
from lodestar.config import settings
from lodestar.db import SessionLocal
from lodestar.engine.dispatcher import cache_evaluation, evaluate
from lodestar.engine.history import LaneIndex, load_history_file, parse_history_csv
from lodestar.engine.policy import load_policy
from lodestar.engine.pricing import PricingModel
from lodestar.ingest.sync import all_terminals, apply_transition, record_event, upsert_fleet, upsert_order, upsert_terminals
from lodestar.models import BoardEvent, LaneStat, Shipment
from lodestar.realtime import hub
from lodestar.state import state

log = logging.getLogger("lodestar.ingest")

LIVE_STATUSES = ("open", "bid_submitted", "accepted", "in_transit")


class IngestWorker:
    def __init__(self, board: BoardClient):
        self.board = board
        self.stop = asyncio.Event()
        self.ready = asyncio.Event()
        self._poll_now = asyncio.Event()
        self._last_fleet_sync: datetime | None = None
        self._last_sim_time: datetime | None = None
        self._ws_connected = False

    def _update_mode(self) -> None:
        """websocket while the socket is up, polling while only REST works, else disconnected."""
        if not state.ingest.board_reachable:
            state.ingest.mode = "disconnected"
        elif self._ws_connected:
            state.ingest.mode = "websocket"
        else:
            state.ingest.mode = "polling"

    # ------------------------------------------------------------------ bootstrap
    async def wait_for_board(self) -> None:
        delay = 1.0
        while not self.stop.is_set():
            try:
                await self.board.health()
                state.ingest.board_reachable = True
                return
            except BoardError as exc:
                state.ingest.board_reachable = False
                state.ingest.last_error = f"board unreachable: {exc.detail}"
                log.warning("Board not reachable at %s (%s); retrying in %.0fs", self.board.base_url, exc.detail, delay)
                await asyncio.sleep(delay)
                delay = min(delay * 1.6, 10.0)

    def load_history(self, csv_text: str | None) -> None:
        rows = []
        source = "none"
        if csv_text:
            rows = parse_history_csv(csv_text)
            source = "board:/history/shipments.csv"
        if not rows and Path(settings.history_csv).exists():
            rows = load_history_file(Path(settings.history_csv))
            source = f"file:{settings.history_csv}"
        if not rows:
            raise RuntimeError("no historical shipments available from the board or on disk")
        state.index = LaneIndex(rows)
        state.pricing = PricingModel(state.index)
        state.ingest.history_source = source
        state.ingest.history_rows = len(rows)
        with SessionLocal() as db:
            db.execute(delete(LaneStat))
            for lane in state.index.lane_table():
                db.add(LaneStat(**lane))
            db.commit()
        log.info("History loaded: %d rows, %d lanes (%s); pricing model AUC=%.3f", len(rows), len(state.index.lanes), source, state.pricing.metrics.auc)

    async def bootstrap(self) -> None:
        await self.wait_for_board()
        await self.sync_clock()
        terminals = await self.board.terminals()
        snapshot = await self.board.fleet_snapshot()
        try:
            csv_text = await self.board.history_csv()
        except BoardError as exc:
            log.warning("history CSV not available from board (%s); using local file", exc.detail)
            csv_text = None
        now = datetime.utcnow()
        with SessionLocal() as db:
            load_policy(db)
            upsert_terminals(db, terminals)
            upsert_fleet(db, snapshot, now, clock.now())
            record_event(db, "boot", "bootstrap", None, f"{len(terminals)} terminals")
            db.commit()
        await asyncio.to_thread(self.load_history, csv_text)
        await self.poll_orders(initial=True)
        state.ingest.booted_at = now
        state.ingest.mode = "polling"
        self.ready.set()
        log.info("Ingestion ready")

    # ------------------------------------------------------------------ clock
    async def sync_clock(self) -> None:
        snap = await self.board.clock()
        sim = snap.get("sim_time_utc")
        clock.sync(sim, snap.get("simulation_speed", 1.0))
        # The board resets its sim epoch whenever the speed changes (and on restart), so a
        # backwards jump is informational here; restarts are detected by vanished loads.
        sim_dt = clock.now()
        if self._last_sim_time and sim_dt < self._last_sim_time - timedelta(seconds=5):
            log.info("Board sim clock moved backwards (speed change or restart)")
            with SessionLocal() as db:
                record_event(db, "poll", "clock.reset", None, f"sim clock jumped from {self._last_sim_time.isoformat()} to {sim_dt.isoformat()}")
                db.commit()
        self._last_sim_time = sim_dt

    # ------------------------------------------------------------------ orders
    def _process_orders(self, orders: list[dict], source: str) -> dict:
        """Upsert a batch of board orders; evaluate open ones; return change summary."""
        now = clock.now()
        changed: list[str] = []
        created: list[str] = []
        transitions: list[dict] = []
        with SessionLocal() as db:
            policy = load_policy(db)
            terminals = all_terminals(db)
            for data in orders:
                ship, old, new = upsert_order(db, data, now, source=source, terminals=terminals)
                db.flush()
                if old is None:
                    created.append(ship.external_id)
                    state.ingest.orders_seen += 1
                if old != new:
                    events = apply_transition(db, ship, old, new, policy, now)
                    transitions.append({"external_id": ship.external_id, "from": old, "to": new, "events": events})
                    record_event(db, source, f"order.{new}", ship.external_id, ",".join(events) or None)
                    changed.append(ship.external_id)
                if new == "open":
                    ev = evaluate(db, ship, policy, state.index, state.pricing, now)
                    if ship.eval_recommendation != ev.recommendation or abs((ship.eval_margin or 0) - (ev.margin or 0)) > 0.5:
                        changed.append(ship.external_id)
                    cache_evaluation(ship, ev)
            # Locally expire open loads the board has not told us about yet.
            for ship in db.scalars(select(Shipment).where(Shipment.board_status == "open", Shipment.expires_at <= now)):
                old = ship.board_status
                ship.board_status = "expired"
                apply_transition(db, ship, old, "expired", policy, now)
                transitions.append({"external_id": ship.external_id, "from": old, "to": "expired", "events": ["local"]})
                changed.append(ship.external_id)
            db.commit()
        return {"created": created, "changed": sorted(set(changed)), "transitions": transitions}

    async def poll_orders(self, initial: bool = False) -> None:
        orders = await self.board.orders(status="all")
        summary = await asyncio.to_thread(self._process_orders, orders, "boot" if initial else "poll")
        await self._reconcile_missing({o["external_id"] for o in orders})
        state.ingest.last_poll_at = datetime.utcnow()
        state.ingest.poll_cycles += 1
        if summary["created"] or summary["changed"]:
            await hub.broadcast("shipments.changed", summary)
        for t in summary["transitions"]:
            if t["to"] in ("accepted", "completed", "bid_lost", "in_transit"):
                await hub.broadcast("fleet.changed", {"reason": t["to"], "external_id": t["external_id"]})

    async def _reconcile_missing(self, board_ids: set[str]) -> None:
        """Loads we think are live but the board no longer lists (restart / re-seed)."""
        with SessionLocal() as db:
            live = list(db.scalars(select(Shipment).where(Shipment.board_status.in_(LIVE_STATUSES))))
            missing = [s for s in live if s.external_id not in board_ids]
            if not missing:
                return
            now = clock.now()
            policy = load_policy(db)
            gone = 0
            for ship in missing:
                try:
                    data = await self.board.order(ship.external_id)
                    _, old, new = upsert_order(db, data, now, source="poll")
                    apply_transition(db, ship, old, new, policy, now)
                except BoardError as exc:
                    if exc.status_code == 404:
                        old = ship.board_status
                        ship.board_status = "gone"
                        apply_transition(db, ship, old, "expired", policy, now)
                        record_event(db, "poll", "order.gone", ship.external_id, "board no longer knows this load")
                        gone += 1
            if gone >= 3:
                state.ingest.board_restarts_detected += 1
                record_event(db, "poll", "board.restart", None, f"{gone} live loads vanished at once")
            db.commit()
        if missing:
            await hub.broadcast("shipments.changed", {"created": [], "changed": [s.external_id for s in missing], "transitions": []})

    async def sync_fleet(self) -> None:
        snapshot = await self.board.fleet_snapshot()
        now = datetime.utcnow()
        sim_now = clock.now()
        result = await asyncio.to_thread(self._apply_fleet, snapshot, now, sim_now)
        state.ingest.last_fleet_sync_at = now
        self._last_fleet_sync = now
        if result["moved"]:
            await hub.broadcast("fleet.changed", {"reason": "rehomed", "moved": result["moved"]})

    def _apply_fleet(self, snapshot: list[dict], now: datetime, sim_now: datetime) -> dict:
        with SessionLocal() as db:
            return upsert_fleet(db, snapshot, now, sim_now)

    def _trim_events(self) -> None:
        with SessionLocal() as db:
            cutoff = datetime.utcnow() - timedelta(hours=6)
            db.execute(delete(BoardEvent).where(BoardEvent.received_at < cutoff))
            db.commit()

    # ------------------------------------------------------------------ loops
    async def poll_loop(self) -> None:
        ticks = 0
        while not self.stop.is_set():
            try:
                await self.sync_clock()
                await self.poll_orders()
                if self._last_fleet_sync is None or (datetime.utcnow() - self._last_fleet_sync).total_seconds() >= settings.fleet_sync_seconds:
                    await self.sync_fleet()
                state.ingest.board_reachable = True
                state.ingest.last_error = None
                self._update_mode()
                await hub.broadcast("clock", clock.snapshot())
                ticks += 1
                if ticks % 100 == 0:
                    await asyncio.to_thread(self._trim_events)
            except BoardError as exc:
                state.ingest.board_reachable = False
                state.ingest.last_error = exc.detail
                self._update_mode()
                log.warning("poll failed: %s", exc.detail)
            except Exception:  # keep the loop alive no matter what
                log.exception("poll tick failed")
            try:
                await asyncio.wait_for(self._poll_now.wait(), timeout=settings.poll_interval_seconds)
            except asyncio.TimeoutError:
                pass
            self._poll_now.clear()

    async def ws_loop(self) -> None:
        url = self.board.ws_url
        while not self.stop.is_set():
            try:
                async with websockets.connect(url, open_timeout=10, ping_interval=20) as ws:
                    self._ws_connected = True
                    self._update_mode()
                    log.info("Connected to board WebSocket %s", url)
                    async for raw in ws:
                        if self.stop.is_set():
                            break
                        await self.handle_ws_message(raw)
            except Exception as exc:
                if self._ws_connected:
                    log.warning("Board WebSocket dropped (%s); falling back to polling", exc)
                self._ws_connected = False
                self._update_mode()
            await asyncio.sleep(settings.ws_reconnect_seconds)

    async def handle_ws_message(self, raw: str | bytes) -> None:
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            return
        state.ingest.ws_events += 1
        state.ingest.last_ws_event_at = datetime.utcnow()
        event = msg.get("event")
        if msg.get("clock"):
            clock.sync(msg["clock"].get("sim_time_utc"), msg["clock"].get("simulation_speed", clock.speed))
        if event == "snapshot":
            summary = await asyncio.to_thread(self._process_orders, msg.get("orders", []), "ws")
        elif event == "order.created":
            summary = await asyncio.to_thread(self._process_orders, [msg["order"]], "ws")
            for ext in summary["created"]:
                await hub.broadcast("shipment.created", {"external_id": ext})
        elif event == "lifecycle":
            # Bids resolved / loads completed: reconcile right away instead of waiting for the next poll.
            self._poll_now.set()
            return
        else:
            return
        if summary["created"] or summary["changed"]:
            await hub.broadcast("shipments.changed", summary)

    async def run(self) -> None:
        try:
            await self.bootstrap()
        except Exception:
            log.exception("bootstrap failed; will keep retrying in the poll loop")
            state.ingest.last_error = "bootstrap failed"
        tasks = [asyncio.create_task(self.poll_loop()), asyncio.create_task(self.ws_loop())]
        await self.stop.wait()
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    def request_poll(self) -> None:
        self._poll_now.set()

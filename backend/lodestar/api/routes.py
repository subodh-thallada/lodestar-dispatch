"""Dispatcher-facing REST + WebSocket API (everything the UI needs lives under /api)."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from lodestar.board.client import BoardError
from lodestar.clock import clock
from lodestar.config import settings
from lodestar.db import get_db
from lodestar.engine import analytics
from lodestar.engine.autopilot import autopilot_tick
from lodestar.engine.dispatcher import cache_evaluation, evaluate
from lodestar.engine.execute import ActionError, execute
from lodestar.engine.policy import AUTOPILOT_MODES, load_policy, update_policy
from lodestar.models import BoardEvent, Decision, FleetUnit, LaneStat, Shipment, Terminal
from lodestar.realtime import hub
from lodestar.serializers import decision_to_dict, lock_to_dict, shipment_to_dict, terminal_to_dict, unit_to_dict
from lodestar.state import state

router = APIRouter(prefix="/api")

OPEN_LIKE = ("open",)
ACTIVE = ("accepted", "in_transit", "bid_submitted")
HISTORY = ("completed", "declined", "expired", "bid_lost", "gone")


def _board():
    if state.board is None:
        raise HTTPException(503, "board client not initialised")
    return state.board


def _require_ready():
    if state.index is None or state.pricing is None:
        raise HTTPException(503, "Lodestar is still bootstrapping (waiting for the board / history)")


# ----------------------------------------------------------------------------- system
@router.get("/health")
def health():
    return {
        "status": "ok",
        "app": settings.app_name,
        "ready": state.index is not None,
        "clock": clock.snapshot(),
        "ingest": state.ingest.to_dict(),
        "ws_clients": hub.client_count,
    }


@router.get("/clock")
def get_clock():
    return clock.snapshot()


@router.get("/status")
def status(db: Session = Depends(get_db)):
    policy = load_policy(db)
    return {
        "clock": clock.snapshot(),
        "ingest": state.ingest.to_dict(),
        "policy": policy.to_dict(),
        "autopilot": {
            "mode": policy.autopilot_mode,
            "runs": state.autopilot_runs,
            "actions": state.autopilot_actions,
            "last_run_at": state.autopilot_last_run.isoformat() + "Z" if state.autopilot_last_run else None,
            "interval_seconds": settings.autopilot_interval_seconds,
        },
        "ws_clients": hub.client_count,
        "board_url": settings.board_url,
    }


class PolicyIn(BaseModel):
    min_margin_usd: Optional[float] = Field(None, ge=0)
    min_margin_pct: Optional[float] = Field(None, ge=0, le=0.9)
    max_deadhead_miles: Optional[float] = Field(None, ge=0)
    reserve_units_per_terminal: Optional[int] = Field(None, ge=0)
    target_bid_margin_pct: Optional[float] = Field(None, ge=0, le=1.0)
    avg_speed_mph: Optional[float] = Field(None, ge=10, le=80)
    turnaround_buffer_minutes: Optional[int] = Field(None, ge=0, le=720)
    chain_weight: Optional[float] = Field(None, ge=0, le=2)
    count_pending_bids_against_capacity: Optional[bool] = None
    autopilot_mode: Optional[str] = None
    autopilot_auto_decline: Optional[bool] = None
    max_weight_lbs: Optional[int] = Field(None, ge=1000)


@router.get("/policy")
def get_policy(db: Session = Depends(get_db)):
    return load_policy(db).to_dict()


@router.put("/policy")
async def put_policy(body: PolicyIn, db: Session = Depends(get_db)):
    try:
        policy = update_policy(db, body.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    # Re-evaluate the open board under the new policy so the UI reflects it immediately.
    _reevaluate_open(db)
    await hub.broadcast("policy.updated", policy.to_dict())
    await hub.broadcast("shipments.changed", {"created": [], "changed": ["*"], "transitions": []})
    return policy.to_dict()


class AutopilotIn(BaseModel):
    mode: str


@router.put("/autopilot")
async def set_autopilot(body: AutopilotIn, db: Session = Depends(get_db)):
    if body.mode not in AUTOPILOT_MODES:
        raise HTTPException(400, f"mode must be one of {AUTOPILOT_MODES}")
    policy = update_policy(db, {"autopilot_mode": body.mode})
    await hub.broadcast("policy.updated", policy.to_dict())
    return {"mode": policy.autopilot_mode}


@router.post("/autopilot/run")
async def run_autopilot_once():
    _require_ready()
    return await autopilot_tick(_board())


def _reevaluate_open(db: Session) -> int:
    if state.index is None:
        return 0
    now = clock.now()
    policy = load_policy(db)
    n = 0
    for ship in db.scalars(select(Shipment).where(Shipment.board_status == "open")):
        cache_evaluation(ship, evaluate(db, ship, policy, state.index, state.pricing, now))
        n += 1
    db.commit()
    return n


# ------------------------------------------------------------------------- shipments
@router.get("/shipments")
def list_shipments(
    status: str = Query("open", description="open|active|history|all|<board status>"),
    order_type: Optional[str] = Query(None, description="fixed_rate|open_bid"),
    recommendation: Optional[str] = Query(None),
    limit: int = Query(300, ge=1, le=2000),
    db: Session = Depends(get_db),
):
    now = clock.now()
    q = select(Shipment)
    if status == "open":
        q = q.where(Shipment.board_status.in_(OPEN_LIKE))
    elif status == "active":
        q = q.where(Shipment.board_status.in_(ACTIVE))
    elif status == "history":
        q = q.where(Shipment.board_status.in_(HISTORY))
    elif status != "all":
        q = q.where(Shipment.board_status == status)
    if order_type:
        q = q.where(Shipment.order_type == order_type)
    if recommendation:
        q = q.where(Shipment.eval_recommendation == recommendation)
    rows = list(db.scalars(q.order_by(Shipment.first_seen_at.desc()).limit(limit)))
    if status == "open":
        # Bookable loads first (every guardrail passes), then by score, then by urgency.
        rows.sort(key=lambda s: (not ((s.eval_json or {}).get("bookable", False)), -(s.eval_score or -1e9), s.expires_at))
    return {"sim_time": clock.snapshot()["sim_time_utc"], "count": len(rows), "shipments": [shipment_to_dict(s, now) for s in rows]}


def _get_shipment(db: Session, external_id: str) -> Shipment:
    ship = db.scalar(select(Shipment).where(Shipment.external_id == external_id.upper()))
    if ship is None:
        raise HTTPException(404, f"shipment {external_id} not known to Lodestar")
    return ship


@router.get("/shipments/{external_id}")
def get_shipment(external_id: str, db: Session = Depends(get_db)):
    ship = _get_shipment(db, external_id)
    decisions = list(db.scalars(select(Decision).where(Decision.shipment_id == ship.id).order_by(Decision.created_at)))
    return {"shipment": shipment_to_dict(ship, clock.now()), "decisions": [decision_to_dict(d) for d in decisions]}


@router.get("/shipments/{external_id}/evaluate")
def evaluate_shipment(external_id: str, db: Session = Depends(get_db)):
    _require_ready()
    ship = _get_shipment(db, external_id)
    ev = evaluate(db, ship, load_policy(db), state.index, state.pricing, clock.now())
    if ship.board_status == "open":
        cache_evaluation(ship, ev)
        db.commit()
    return ev.to_dict()


class ActionIn(BaseModel):
    bid_rate: Optional[float] = Field(None, gt=0)
    override: bool = False
    note: Optional[str] = None


async def _act(external_id: str, action: str, body: ActionIn | None, db: Session):
    _require_ready()
    ship = _get_shipment(db, external_id)
    body = body or ActionIn()
    try:
        res = await execute(db, _board(), ship, action, "dispatcher", bid_rate=body.bid_rate, override=body.override, note=body.note)
    except ActionError as exc:
        raise HTTPException(exc.status_code, exc.detail)
    except BoardError as exc:
        raise HTTPException(502, f"board error: {exc.detail}")
    payload = res.to_dict(lambda s: shipment_to_dict(s, clock.now()))
    if not res.ok:
        raise HTTPException(res.status_code, detail=payload)
    return payload


@router.post("/shipments/{external_id}/accept")
async def accept_shipment(external_id: str, body: ActionIn | None = None, db: Session = Depends(get_db)):
    return await _act(external_id, "accept", body, db)


@router.post("/shipments/{external_id}/decline")
async def decline_shipment(external_id: str, body: ActionIn | None = None, db: Session = Depends(get_db)):
    return await _act(external_id, "decline", body, db)


@router.post("/shipments/{external_id}/bid")
async def bid_shipment(external_id: str, body: ActionIn | None = None, db: Session = Depends(get_db)):
    return await _act(external_id, "bid", body, db)


# ------------------------------------------------------------------------------ fleet
@router.get("/terminals")
def terminals(db: Session = Depends(get_db)):
    now = clock.now()
    return {"sim_time": clock.snapshot()["sim_time_utc"], "terminals": analytics.terminal_board(db, now, load_policy(db))}


@router.get("/terminals/{code}")
def terminal(code: str, db: Session = Depends(get_db)):
    t = db.get(Terminal, code.upper())
    if t is None:
        raise HTTPException(404, "terminal not found")
    now = clock.now()
    units = list(db.scalars(select(FleetUnit).where(FleetUnit.home_terminal_code == t.code).order_by(FleetUnit.unit_number)))
    return {"terminal": terminal_to_dict(t), "units": [unit_to_dict(u, now) for u in units]}


@router.get("/fleet/units")
def fleet_units(terminal_code: Optional[str] = None, db: Session = Depends(get_db)):
    now = clock.now()
    q = select(FleetUnit).order_by(FleetUnit.home_terminal_code, FleetUnit.unit_number)
    if terminal_code:
        q = q.where(FleetUnit.home_terminal_code == terminal_code.upper())
    return {"sim_time": clock.snapshot()["sim_time_utc"], "units": [unit_to_dict(u, now) for u in db.scalars(q)]}


@router.get("/fleet/units/{unit_id}")
def fleet_unit(unit_id: int, db: Session = Depends(get_db)):
    u = db.get(FleetUnit, unit_id)
    if u is None:
        raise HTTPException(404, "unit not found")
    now = clock.now()
    data = unit_to_dict(u, now)
    data["all_locks"] = [lock_to_dict(l) for l in sorted(u.locks, key=lambda l: l.starts_at)]
    return data


@router.get("/schedule")
def get_schedule(hours_back: float = Query(6, ge=0, le=72), hours_ahead: float = Query(48, ge=1, le=240), db: Session = Depends(get_db)):
    return analytics.schedule(db, clock.now(), hours_back, hours_ahead)


@router.get("/capacity/forecast")
def forecast(db: Session = Depends(get_db)):
    return analytics.capacity_forecast(db, clock.now(), load_policy(db))


# -------------------------------------------------------------------------- analytics
@router.get("/kpis")
def get_kpis(db: Session = Depends(get_db)):
    return analytics.kpis(db, clock.now())


@router.get("/decisions")
def decisions(limit: int = Query(100, ge=1, le=1000), actor: Optional[str] = None, action: Optional[str] = None, db: Session = Depends(get_db)):
    q = select(Decision).order_by(Decision.created_at.desc()).limit(limit)
    if actor:
        q = q.where(Decision.actor == actor)
    if action:
        q = q.where(Decision.action == action)
    return {"decisions": [decision_to_dict(d) for d in db.scalars(q)]}


@router.get("/analytics/history")
def history_analytics(db: Session = Depends(get_db)):
    _require_ready()
    lanes = [
        {
            "lane_id": l.lane_id,
            "origin_code": l.origin_code,
            "destination_code": l.destination_code,
            "shipments": l.shipments,
            "wins": l.wins,
            "win_rate": l.win_rate,
            "avg_distance_miles": l.avg_distance_miles,
            "median_market_rpm": l.median_market_rpm,
            "avg_cost_per_mile": l.avg_cost_per_mile,
            "avg_margin_won": l.avg_margin_won,
            "avg_margin_pct_won": l.avg_margin_pct_won,
            "fixed_rate_accept_rate": l.fixed_rate_accept_rate,
            "open_bid_win_rate": l.open_bid_win_rate,
        }
        for l in db.scalars(select(LaneStat).order_by(LaneStat.shipments.desc()))
    ]
    return {"summary": state.index.summary(), "hubs": state.index.hub_table(), "lanes": lanes, "source": state.ingest.history_source}


@router.get("/analytics/model")
def model_metrics():
    _require_ready()
    return {"model": "L2 logistic regression (numpy, Newton's method)", "features": ["gap = bid/market - 1", "log(miles)", "weight/10k", "season"], **state.pricing.metrics.to_dict()}


class PriceQuery(BaseModel):
    origin_code: str
    destination_code: str
    miles: float = Field(gt=0)
    weight_lbs: float = Field(default=40_000, gt=0)
    total_cost: float = Field(gt=0)
    season: str = "fall"


@router.post("/analytics/price")
def price(body: PriceQuery, db: Session = Depends(get_db)):
    _require_ready()
    p = load_policy(db)
    return state.pricing.suggest_bid(
        origin_code=body.origin_code.upper(),
        destination_code=body.destination_code.upper(),
        miles=body.miles,
        weight_lbs=body.weight_lbs,
        season=body.season,
        total_cost=body.total_cost,
        min_margin_usd=p.min_margin_usd,
        min_margin_pct=p.min_margin_pct,
        target_margin_pct=p.target_bid_margin_pct,
    )


@router.get("/analytics/inventory-history")
def inventory_history(db: Session = Depends(get_db)):
    return {"samples": analytics.inventory_history(db)}


@router.get("/events")
def events(limit: int = Query(100, ge=1, le=1000), db: Session = Depends(get_db)):
    rows = db.scalars(select(BoardEvent).order_by(BoardEvent.received_at.desc()).limit(limit))
    return {"events": [{"id": e.id, "source": e.source, "event": e.event, "external_id": e.external_id, "detail": e.detail, "received_at": e.received_at.isoformat() + "Z"} for e in rows]}


# -------------------------------------------------------------- demo / sim controls
class SpeedIn(BaseModel):
    simulation_speed: float = Field(ge=1, le=100_000)


@router.post("/sim/speed")
async def sim_speed(body: SpeedIn):
    try:
        snap = await _board().set_speed(body.simulation_speed)
    except BoardError as exc:
        raise HTTPException(502, exc.detail)
    clock.sync(snap["sim_time_utc"], snap["simulation_speed"])
    await hub.broadcast("clock", clock.snapshot())
    return clock.snapshot()


class SpawnIn(BaseModel):
    count: int = Field(6, ge=1, le=50)


@router.post("/sim/spawn")
async def sim_spawn(body: SpawnIn | None = None):
    try:
        out = await _board().spawn_orders((body or SpawnIn()).count)
    except BoardError as exc:
        raise HTTPException(502, exc.detail)
    return out


@router.get("/sim/settings")
async def sim_settings():
    try:
        return await _board().simulation_settings()
    except BoardError as exc:
        raise HTTPException(502, exc.detail)


class IntervalIn(BaseModel):
    order_interval_seconds: float = Field(ge=0.5, le=3600)


@router.post("/sim/interval")
async def sim_interval(body: IntervalIn):
    try:
        return await _board().set_settings(order_interval_seconds=body.order_interval_seconds)
    except BoardError as exc:
        raise HTTPException(502, exc.detail)


# --------------------------------------------------------------------------- websocket
@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await hub.connect(ws)
    try:
        await ws.send_json({"event": "hello", "data": {"clock": clock.snapshot(), "ingest": state.ingest.to_dict()}})
        while True:
            await ws.receive_text()  # keepalive pings from the browser
    except WebSocketDisconnect:
        await hub.disconnect(ws)
    except Exception:
        await hub.disconnect(ws)

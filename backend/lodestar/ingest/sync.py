"""Board payloads -> Lodestar schema, and lock lifecycle on status transitions."""

from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from lodestar.clock import parse_ts
from lodestar.engine.geo import haversine_miles, nearest_hub
from lodestar.engine.locks import create_lock, plan_lock, release_locks
from lodestar.engine.policy import Policy
from lodestar.models import BoardEvent, FleetUnit, InventorySnapshot, Shipment, Terminal, UnitLock

log = logging.getLogger("lodestar.sync")

TERMINAL_STATUSES = {"accepted", "in_transit", "completed"}
RELEASE_STATUSES = {"bid_lost", "expired", "declined", "completed"}


def record_event(db: Session, source: str, event: str, external_id: str | None = None, detail: str | None = None) -> None:
    db.add(BoardEvent(source=source, event=event, external_id=external_id, detail=detail, received_at=datetime.utcnow()))


# --- terminals -------------------------------------------------------------------------


def upsert_terminals(db: Session, data: list[dict]) -> int:
    n = 0
    for t in data:
        row = db.get(Terminal, t["code"])
        if row is None:
            row = Terminal(code=t["code"])
            db.add(row)
            n += 1
        row.board_id = t["id"]
        row.name = t["name"]
        row.city = t["city"]
        row.state = t["state"]
        row.latitude = t["latitude"]
        row.longitude = t["longitude"]
        row.unit_capacity = t.get("unit_capacity", 0)
    db.commit()
    return n


def all_terminals(db: Session) -> list[Terminal]:
    return list(db.scalars(select(Terminal).order_by(Terminal.code)))


def resolve_hub(db: Session, code: str | None, lat: float, lon: float, terminals: list[Terminal] | None = None) -> str:
    if code:
        return code.upper()
    terminals = terminals or all_terminals(db)
    hub = nearest_hub(lat, lon, terminals)
    return hub.code if hub else ""


# --- fleet -------------------------------------------------------------------------------


def upsert_fleet(db: Session, snapshot: list[dict], now: datetime, sim_now: datetime) -> dict:
    """Apply /fleet/snapshot. The board is authoritative for status, home hub and position."""
    moved: list[dict] = []
    seen = 0
    terminal_by_board_id = {t.board_id: t.code for t in all_terminals(db)}
    for block in snapshot:
        code = block["terminal"]["code"]
        for u in block.get("units", []):
            seen += 1
            row = db.get(FleetUnit, u["id"])
            home = terminal_by_board_id.get(u["home_terminal_id"], code)
            if row is None:
                row = FleetUnit(id=u["id"], unit_number=u["unit_number"], employee_code=u["employee_code"])
                db.add(row)
            elif row.home_terminal_code != home:
                moved.append({"unit": row.unit_number, "from": row.home_terminal_code, "to": home})
            row.unit_number = u["unit_number"]
            row.employee_code = u["employee_code"]
            row.driver_name = f"{u.get('first_name', '')} {u.get('last_name', '')}".strip()
            row.home_terminal_code = home
            row.board_status = u.get("status", "available")
            row.current_latitude = u["current_latitude"]
            row.current_longitude = u["current_longitude"]
            row.board_available_at = parse_ts(u.get("available_at"))
            row.last_synced_at = now
        # inventory sample (our soft-lock exposure alongside the board's counts)
        unit_ids = [u["id"] for u in block.get("units", [])]
        soft = 0
        if unit_ids:
            soft = len(
                set(
                    db.scalars(
                        select(UnitLock.unit_id).where(
                            UnitLock.unit_id.in_(unit_ids),
                            UnitLock.status == "active",
                            UnitLock.kind == "soft",
                            UnitLock.starts_at <= sim_now,
                            UnitLock.ends_at > sim_now,
                        )
                    )
                )
            )
        db.add(
            InventorySnapshot(
                terminal_code=code,
                sim_time=sim_now,
                total_units=block.get("total_units", len(unit_ids)),
                available_units=block.get("available_units", 0),
                assigned_units=block.get("assigned_units", 0),
                soft_locked_units=soft,
            )
        )
    db.commit()
    return {"units": seen, "moved": moved}


# --- orders ------------------------------------------------------------------------------


def upsert_order(db: Session, data: dict, now: datetime, source: str = "poll", terminals: list[Terminal] | None = None) -> tuple[Shipment, str | None, str]:
    """Insert/update a shipment from a board order payload. Returns (shipment, old_status, new_status)."""
    ext = data["external_id"]
    row = db.scalar(select(Shipment).where(Shipment.external_id == ext))
    old_status = row.board_status if row else None
    terminals = terminals or all_terminals(db)
    if row is None:
        row = Shipment(external_id=ext, first_seen_at=now)
        db.add(row)
        record_event(db, source, "order.seen", ext)
    row.board_id = data["id"]
    row.order_type = data["order_type"]
    row.board_status = data["status"]
    row.origin_city = data["origin_city"]
    row.origin_state = data["origin_state"]
    row.origin_latitude = data["origin_latitude"]
    row.origin_longitude = data["origin_longitude"]
    row.origin_terminal_code = data.get("origin_terminal_code")
    row.origin_hub_code = resolve_hub(db, row.origin_terminal_code, row.origin_latitude, row.origin_longitude, terminals)
    row.destination_city = data["destination_city"]
    row.destination_state = data["destination_state"]
    row.destination_latitude = data["destination_latitude"]
    row.destination_longitude = data["destination_longitude"]
    row.destination_terminal_code = data.get("destination_terminal_code")
    row.destination_hub_code = resolve_hub(db, row.destination_terminal_code, row.destination_latitude, row.destination_longitude, terminals)
    row.lane_id = f"{row.origin_hub_code}-{row.destination_hub_code}"
    row.distance_miles = float(data["distance_miles"])
    row.weight_lbs = int(data["weight_lbs"])
    row.offered_rate = data.get("offered_rate")
    row.cost_per_mile = float(data.get("cost_per_mile") or 1.8)
    row.estimated_cost = float(data.get("estimated_cost") or row.distance_miles * row.cost_per_mile)
    row.board_deadhead_miles = float(data.get("estimated_deadhead_miles") or 0.0)
    row.board_deadhead_cost = float(data.get("estimated_deadhead_cost") or 0.0)
    row.pickup_at = parse_ts(data["pickup_at"])
    row.delivery_at = parse_ts(data["delivery_at"])
    row.expires_at = parse_ts(data["expires_at"])
    row.board_created_at = parse_ts(data["created_at"])
    row.last_seen_at = now
    row.notes = data.get("notes")
    row.bid_decision_at = parse_ts(data.get("bid_decision_at"))
    if data.get("winning_bid_rate") is not None:
        row.our_bid_rate = data["winning_bid_rate"]
    if data.get("assigned_driver_id") is not None:
        row.assigned_unit_id = data["assigned_driver_id"]
        row.assigned_terminal_code = data.get("assigned_terminal_code")
    return row, old_status, row.board_status


def apply_transition(db: Session, shipment: Shipment, old: str | None, new: str, policy: Policy, now: datetime) -> list[str]:
    """Keep locks and booking economics consistent with the board's lifecycle."""
    events: list[str] = []
    if old == new:
        return events

    if new in {"accepted", "in_transit"} and old not in {"accepted", "in_transit"}:
        unit = db.get(FleetUnit, shipment.assigned_unit_id) if shipment.assigned_unit_id else None
        release_locks(db, shipment, "bid_won" if old == "bid_submitted" else "superseded", now, kinds=("soft",))
        if shipment.payout is None:
            shipment.payout = shipment.offered_rate if shipment.order_type == "fixed_rate" else shipment.our_bid_rate
        if shipment.booked_at is None:
            shipment.booked_at = now
        if shipment.booked_by is None:
            shipment.booked_by = "external"
        if unit is not None:
            plan = plan_lock(db, unit, shipment, policy, now, include_soft=False)
            lock = create_lock(db, plan, shipment, "hard", now)
            if not plan.feasible:
                record_event(db, "sync", "lock.forced", shipment.external_id, f"board bound {unit.unit_number} but our model says: {plan.reason}")
                events.append("lock.forced")
            # Economics as actually booked (board's unit, our deadhead model)
            shipment.booked_deadhead_miles = plan.deadhead_miles
            shipment.booked_deadhead_cost = round(plan.deadhead_miles * shipment.cost_per_mile, 2)
            shipment.booked_total_cost = round(shipment.estimated_cost + shipment.booked_deadhead_cost, 2)
            if shipment.payout is not None:
                shipment.booked_margin = round(shipment.payout - shipment.booked_total_cost, 2)
            events.append(f"lock.created:{lock.unit_id}")
        else:
            events.append("lock.missing_unit")
        shipment.autopilot_handled = True
        shipment.eval_recommendation = None

    if new == "completed":
        release_locks(db, shipment, "completed", now)
        unit = db.get(FleetUnit, shipment.assigned_unit_id) if shipment.assigned_unit_id else None
        if unit is not None:
            # Capacity follows the freight: the unit now lives at the destination hub.
            unit.home_terminal_code = shipment.destination_hub_code
            unit.current_latitude = shipment.destination_latitude
            unit.current_longitude = shipment.destination_longitude
            unit.board_status = "available"
            unit.board_available_at = None
        events.append("lock.released:completed")

    if new in {"bid_lost", "expired", "declined"}:
        n = release_locks(db, shipment, new, now)
        if n:
            events.append(f"lock.released:{new}")
        shipment.autopilot_handled = True

    if new == "bid_submitted" and old != "bid_submitted" and shipment.booked_by is None:
        shipment.booked_by = "external"
        shipment.autopilot_handled = True

    return events


def unit_distance_to(unit: FleetUnit, lat: float, lon: float) -> float:
    return haversine_miles(unit.current_latitude, unit.current_longitude, lat, lon)

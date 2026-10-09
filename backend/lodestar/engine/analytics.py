"""KPIs, capacity forecasts and schedule views computed from Lodestar's own tables."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from lodestar.clock import iso
from lodestar.engine.locks import active_locks
from lodestar.engine.policy import Policy
from lodestar.models import Decision, FleetUnit, InventorySnapshot, Shipment, Terminal, UnitLock
from lodestar.serializers import lock_to_dict

BOOKED = ("accepted", "in_transit", "completed")


def kpis(db: Session, now: datetime) -> dict:
    booked = list(db.scalars(select(Shipment).where(Shipment.board_status.in_(BOOKED), Shipment.payout.isnot(None))))
    revenue = sum(s.payout or 0 for s in booked)
    cost = sum(s.booked_total_cost or (s.estimated_cost + (s.booked_deadhead_cost or 0)) for s in booked)
    loaded_miles = sum(s.distance_miles for s in booked)
    deadhead_miles = sum(s.booked_deadhead_miles or 0 for s in booked)
    margin = revenue - cost

    seen = db.scalar(select(func.count(Shipment.id))) or 0
    by_status = dict(db.execute(select(Shipment.board_status, func.count(Shipment.id)).group_by(Shipment.board_status)).all())
    bids = list(db.scalars(select(Shipment).where(Shipment.order_type == "open_bid", Shipment.our_bid_rate.isnot(None), Shipment.booked_by.isnot(None))))
    bids_won = [s for s in bids if s.board_status in BOOKED]
    bids_lost = [s for s in bids if s.board_status == "bid_lost"]
    bids_pending = [s for s in bids if s.board_status == "bid_submitted"]

    units = list(db.scalars(select(FleetUnit)))
    usable = [u for u in units if u.board_status not in ("maintenance", "off_duty")]
    busy_ids = set(
        db.scalars(
            select(UnitLock.unit_id).where(UnitLock.status == "active", UnitLock.kind == "hard", UnitLock.starts_at <= now, UnitLock.ends_at > now)
        )
    )

    declined = list(db.scalars(select(Decision).where(Decision.action == "decline", Decision.outcome == "ok")))
    losses_avoided = sum(-d.expected_margin for d in declined if d.expected_margin is not None and d.expected_margin < 0)
    by_actor = dict(db.execute(select(Decision.actor, func.count(Decision.id)).where(Decision.outcome == "ok", Decision.action.in_(("accept", "bid", "decline"))).group_by(Decision.actor)).all())
    blocked = db.scalar(select(func.count(Decision.id)).where(Decision.outcome == "blocked")) or 0
    rejected = db.scalar(select(func.count(Decision.id)).where(Decision.outcome == "rejected")) or 0

    return {
        "sim_time": iso(now),
        "opportunities_seen": seen,
        "by_status": by_status,
        "booked_loads": len(booked),
        "booked_revenue": round(revenue, 2),
        "booked_cost": round(cost, 2),
        "booked_margin": round(margin, 2),
        "booked_margin_pct": round(margin / revenue, 4) if revenue else None,
        "avg_margin_per_load": round(margin / len(booked), 2) if booked else None,
        "loaded_miles": round(loaded_miles, 1),
        "deadhead_miles": round(deadhead_miles, 1),
        "empty_mile_ratio": round(deadhead_miles / (loaded_miles + deadhead_miles), 4) if (loaded_miles + deadhead_miles) else None,
        "revenue_per_loaded_mile": round(revenue / loaded_miles, 3) if loaded_miles else None,
        "fleet_units": len(units),
        "units_busy_now": len(busy_ids),
        "utilization_now": round(len(busy_ids) / len(usable), 4) if usable else None,
        "bids_submitted": len(bids),
        "bids_won": len(bids_won),
        "bids_lost": len(bids_lost),
        "bids_pending": len(bids_pending),
        "bid_win_rate": round(len(bids_won) / (len(bids_won) + len(bids_lost)), 3) if (bids_won or bids_lost) else None,
        "bid_exposure_usd": round(sum(s.our_bid_rate or 0 for s in bids_pending), 2),
        "declined_loads": len(declined),
        "losses_avoided_usd": round(losses_avoided, 2),
        "decisions_by_actor": by_actor,
        "guardrail_blocks": blocked,
        "board_rejections": rejected,
    }


def _unit_projection(db: Session, unit: FleetUnit, at: datetime) -> tuple[str | None, bool]:
    """(hub where the unit will be at `at`, busy?)"""
    locks = active_locks(db, unit.id, include_soft=True)
    hub = unit.home_terminal_code
    last_end = None
    for lock in locks:
        if lock.starts_at <= at < lock.ends_at:
            return (lock.shipment.destination_hub_code, True)
        if lock.ends_at <= at and (last_end is None or lock.ends_at > last_end):
            last_end = lock.ends_at
            hub = lock.shipment.destination_hub_code
    return (hub, False)


def capacity_forecast(db: Session, now: datetime, policy: Policy, horizons_hours: tuple[float, ...] = (0, 2, 6, 12, 24)) -> dict:
    """Projected free units per hub as capacity follows the freight (locks included)."""
    terminals = list(db.scalars(select(Terminal).order_by(Terminal.code)))
    units = [u for u in db.scalars(select(FleetUnit)) if u.board_status not in ("maintenance", "off_duty")]
    totals = {t.code: 0 for t in terminals}
    for u in db.scalars(select(FleetUnit)):
        totals[u.home_terminal_code] = totals.get(u.home_terminal_code, 0) + 1
    points: dict[str, list[dict]] = {t.code: [] for t in terminals}
    warnings: list[dict] = []
    for h in horizons_hours:
        at = now + timedelta(hours=h)
        free: dict[str, int] = {t.code: 0 for t in terminals}
        inbound: dict[str, int] = {t.code: 0 for t in terminals}
        for u in units:
            hub, busy = _unit_projection(db, u, at)
            if hub is None:
                continue
            if busy:
                inbound[hub] = inbound.get(hub, 0) + 1
            else:
                free[hub] = free.get(hub, 0) + 1
        for t in terminals:
            points[t.code].append({"hours_ahead": h, "at": iso(at), "free": free.get(t.code, 0), "inbound": inbound.get(t.code, 0)})
    for t in terminals:
        series = points[t.code]
        now_free = series[0]["free"]
        soon = next((p for p in series if p["hours_ahead"] >= 6), series[-1])
        if now_free == 0:
            warnings.append({"terminal_code": t.code, "level": "critical", "message": f"{t.code} has no free units right now"})
        elif now_free <= policy.reserve_units_per_terminal:
            warnings.append({"terminal_code": t.code, "level": "warning", "message": f"{t.code} is at its reserve floor ({now_free} free)"})
        elif soon["free"] < policy.reserve_units_per_terminal:
            warnings.append({"terminal_code": t.code, "level": "warning", "message": f"{t.code} drops to {soon['free']} free within {soon['hours_ahead']:.0f}h"})
        if totals.get(t.code, 0) and now_free / totals[t.code] >= 0.9 and totals[t.code] >= 6:
            warnings.append({"terminal_code": t.code, "level": "info", "message": f"{t.code} is idle-heavy ({now_free}/{totals[t.code]} free) — favour outbound loads"})
    return {"sim_time": iso(now), "horizons_hours": list(horizons_hours), "terminals": points, "totals": totals, "warnings": warnings}


def terminal_board(db: Session, now: datetime, policy: Policy) -> list[dict]:
    """Per-hub utilization for the network panel."""
    terminals = list(db.scalars(select(Terminal).order_by(Terminal.code)))
    units = list(db.scalars(select(FleetUnit)))
    hard_busy = set(db.scalars(select(UnitLock.unit_id).where(UnitLock.status == "active", UnitLock.kind == "hard", UnitLock.starts_at <= now, UnitLock.ends_at > now)))
    soft_busy = set(db.scalars(select(UnitLock.unit_id).where(UnitLock.status == "active", UnitLock.kind == "soft", UnitLock.starts_at <= now + timedelta(hours=12), UnitLock.ends_at > now)))
    committed = set(db.scalars(select(UnitLock.unit_id).where(UnitLock.status == "active", UnitLock.kind == "hard", UnitLock.starts_at > now)))
    open_by_hub = dict(db.execute(select(Shipment.origin_hub_code, func.count(Shipment.id)).where(Shipment.board_status == "open").group_by(Shipment.origin_hub_code)).all())
    out = []
    for t in terminals:
        mine = [u for u in units if u.home_terminal_code == t.code]
        usable = [u for u in mine if u.board_status not in ("maintenance", "off_duty")]
        busy = [u for u in usable if u.id in hard_busy]
        soft = [u for u in usable if u.id in soft_busy and u.id not in hard_busy]
        comm = [u for u in usable if u.id in committed and u.id not in hard_busy and u.id not in soft_busy]
        free = [u for u in usable if u.id not in hard_busy and u.id not in soft_busy and u.id not in committed]
        board_free = sum(1 for u in usable if u.board_status == "available" or (u.board_available_at and u.board_available_at <= now))
        level = "ok"
        if not free:
            level = "critical"
        elif len(free) <= policy.reserve_units_per_terminal:
            level = "warning"
        out.append(
            {
                "code": t.code,
                "name": t.name,
                "city": t.city,
                "state": t.state,
                "latitude": t.latitude,
                "longitude": t.longitude,
                "total_units": len(mine),
                "usable_units": len(usable),
                "free_units": len(free),
                "busy_units": len(busy),
                "soft_locked_units": len(soft),
                "committed_units": len(comm),
                "out_of_service": len(mine) - len(usable),
                "board_free_units": board_free,
                "utilization": round(len(busy) / len(usable), 3) if usable else 0.0,
                "open_loads_from_here": open_by_hub.get(t.code, 0),
                "reserve": policy.reserve_units_per_terminal,
                "level": level,
            }
        )
    return out


def schedule(db: Session, now: datetime, hours_back: float = 6, hours_ahead: float = 48) -> dict:
    lo = now - timedelta(hours=hours_back)
    hi = now + timedelta(hours=hours_ahead)
    locks = list(
        db.scalars(
            select(UnitLock).where(UnitLock.ends_at >= lo, UnitLock.starts_at <= hi).order_by(UnitLock.unit_id, UnitLock.starts_at)
        )
    )
    units = list(db.scalars(select(FleetUnit).order_by(FleetUnit.home_terminal_code, FleetUnit.unit_number)))
    by_unit: dict[int, list[dict]] = {}
    for lk in locks:
        by_unit.setdefault(lk.unit_id, []).append(lock_to_dict(lk))
    return {
        "sim_time": iso(now),
        "window": {"from": iso(lo), "to": iso(hi)},
        "units": [
            {
                "id": u.id,
                "unit_number": u.unit_number,
                "driver_name": u.driver_name,
                "home_terminal_code": u.home_terminal_code,
                "board_status": u.board_status,
                "locks": by_unit.get(u.id, []),
            }
            for u in units
        ],
    }


def inventory_history(db: Session, hours: float = 12) -> list[dict]:
    rows = list(db.scalars(select(InventorySnapshot).order_by(InventorySnapshot.sim_time.desc()).limit(10 * 400)))
    rows.reverse()
    return [
        {
            "terminal_code": r.terminal_code,
            "sim_time": iso(r.sim_time),
            "total": r.total_units,
            "available": r.available_units,
            "assigned": r.assigned_units,
            "soft_locked": r.soft_locked_units,
        }
        for r in rows
    ]

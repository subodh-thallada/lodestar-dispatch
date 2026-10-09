"""ORM -> JSON for the dispatcher API."""

from __future__ import annotations

from datetime import datetime

from lodestar.clock import iso
from lodestar.engine.geo import interpolate
from lodestar.models import Decision, FleetUnit, Shipment, Terminal, UnitLock


def shipment_to_dict(s: Shipment, now: datetime | None = None) -> dict:
    now = now or datetime.utcnow()
    seconds_remaining = max(0, int((s.expires_at - now).total_seconds())) if s.board_status == "open" else 0
    return {
        "id": s.id,
        "external_id": s.external_id,
        "order_type": s.order_type,
        "status": s.board_status,
        "lane_id": s.lane_id,
        "origin": {
            "city": s.origin_city,
            "state": s.origin_state,
            "latitude": s.origin_latitude,
            "longitude": s.origin_longitude,
            "terminal_code": s.origin_terminal_code,
            "hub_code": s.origin_hub_code,
        },
        "destination": {
            "city": s.destination_city,
            "state": s.destination_state,
            "latitude": s.destination_latitude,
            "longitude": s.destination_longitude,
            "terminal_code": s.destination_terminal_code,
            "hub_code": s.destination_hub_code,
        },
        "distance_miles": s.distance_miles,
        "weight_lbs": s.weight_lbs,
        "offered_rate": s.offered_rate,
        "cost_per_mile": s.cost_per_mile,
        "estimated_cost": s.estimated_cost,
        "board_deadhead_miles": s.board_deadhead_miles,
        "board_deadhead_cost": s.board_deadhead_cost,
        "pickup_at": iso(s.pickup_at),
        "delivery_at": iso(s.delivery_at),
        "expires_at": iso(s.expires_at),
        "seconds_remaining": seconds_remaining,
        "board_created_at": iso(s.board_created_at),
        "first_seen_at": iso(s.first_seen_at),
        "our_bid_rate": s.our_bid_rate,
        "bid_decision_at": iso(s.bid_decision_at),
        "assigned_unit_id": s.assigned_unit_id,
        "assigned_unit_number": s.assigned_unit.unit_number if s.assigned_unit else None,
        "assigned_terminal_code": s.assigned_terminal_code,
        "booked_by": s.booked_by,
        "booked_at": iso(s.booked_at),
        "payout": s.payout,
        "booked_deadhead_miles": s.booked_deadhead_miles,
        "booked_deadhead_cost": s.booked_deadhead_cost,
        "booked_total_cost": s.booked_total_cost,
        "booked_margin": s.booked_margin,
        "recommendation": s.eval_recommendation,
        "evaluation": s.eval_json,
        "evaluated_at": iso(s.evaluated_at),
    }


def lock_to_dict(lock: UnitLock) -> dict:
    s = lock.shipment
    return {
        "id": lock.id,
        "unit_id": lock.unit_id,
        "unit_number": lock.unit.unit_number if lock.unit else None,
        "shipment_id": lock.shipment_id,
        "external_id": s.external_id if s else None,
        "lane_id": s.lane_id if s else None,
        "status_of_load": s.board_status if s else None,
        "kind": lock.kind,
        "status": lock.status,
        "starts_at": iso(lock.starts_at),
        "depart_at": iso(lock.depart_at),
        "pickup_at": iso(lock.pickup_at),
        "delivery_at": iso(lock.delivery_at),
        "ends_at": iso(lock.ends_at),
        "deadhead_miles": lock.deadhead_miles,
        "payout": s.payout if s else None,
        "margin": s.booked_margin if s else None,
        "origin_city": s.origin_city if s else None,
        "destination_city": s.destination_city if s else None,
        "released_at": iso(lock.released_at),
        "release_reason": lock.release_reason,
    }


def unit_to_dict(u: FleetUnit, sim_now: datetime) -> dict:
    active = sorted((lk for lk in u.locks if lk.status == "active"), key=lambda lk: lk.starts_at)
    current = next((lk for lk in active if lk.starts_at <= sim_now < lk.ends_at), None)
    upcoming = [lk for lk in active if lk.starts_at > sim_now]
    phase = "idle"
    lat, lon, progress = u.current_latitude, u.current_longitude, None
    if current is not None:
        s = current.shipment
        if current.kind == "soft":
            phase = "bid_pending"
        elif sim_now < current.pickup_at:
            phase = "deadheading"
            lat, lon, progress = interpolate(current.from_latitude, current.from_longitude, s.origin_latitude, s.origin_longitude, current.depart_at, current.pickup_at, sim_now)
        elif sim_now < current.delivery_at:
            phase = "in_transit"
            lat, lon, progress = interpolate(s.origin_latitude, s.origin_longitude, s.destination_latitude, s.destination_longitude, current.pickup_at, current.delivery_at, sim_now)
        else:
            phase = "turnaround"
            lat, lon = s.destination_latitude, s.destination_longitude
    elif upcoming:
        phase = "committed"
    if u.board_status in ("maintenance", "off_duty"):
        phase = u.board_status
    return {
        "id": u.id,
        "unit_number": u.unit_number,
        "employee_code": u.employee_code,
        "driver_name": u.driver_name,
        "home_terminal_code": u.home_terminal_code,
        "board_status": u.board_status,
        "board_available_at": iso(u.board_available_at),
        "phase": phase,
        "latitude": round(lat, 5),
        "longitude": round(lon, 5),
        "progress": None if progress is None else round(progress, 3),
        "current_lock": lock_to_dict(current) if current else None,
        "upcoming_locks": [lock_to_dict(lk) for lk in upcoming[:5]],
        "last_synced_at": iso(u.last_synced_at),
    }


def terminal_to_dict(t: Terminal) -> dict:
    return {
        "code": t.code,
        "name": t.name,
        "city": t.city,
        "state": t.state,
        "latitude": t.latitude,
        "longitude": t.longitude,
        "unit_capacity": t.unit_capacity,
    }


def decision_to_dict(d: Decision) -> dict:
    return {
        "id": d.id,
        "external_id": d.external_id,
        "actor": d.actor,
        "action": d.action,
        "outcome": d.outcome,
        "bid_rate": d.bid_rate,
        "expected_margin": d.expected_margin,
        "deadhead_miles": d.deadhead_miles,
        "score": d.score,
        "override": d.override,
        "guardrails": d.guardrails,
        "reasons": d.reasons,
        "board_status_code": d.board_status_code,
        "message": d.message,
        "created_at": iso(d.created_at),
        "sim_time": iso(d.sim_time),
        "lane_id": d.shipment.lane_id if d.shipment else None,
        "order_type": d.shipment.order_type if d.shipment else None,
    }

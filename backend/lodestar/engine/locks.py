"""Temporal resource locks.

A unit is committed to a shipment for the interval

    [depart_at, delivery_at + turnaround_buffer)

where depart_at = pickup_at - deadhead_travel_time. Two things make this stricter than
the board's own model:

1. The empty move to the pickup is inside the lock, so a unit that is still delivering
   load A 300 miles away cannot be booked for load B that picks up in two hours.
2. A unit's *projected position* is tracked: after lock A ends the unit is at A's
   destination, and that is where deadhead for the next load is measured from. The
   board only moves a unit when the load completes; we know where it is going to be.

Soft locks represent capacity exposure from outstanding open bids.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from lodestar.engine.geo import haversine_miles, travel_time
from lodestar.engine.policy import Policy
from lodestar.models import FleetUnit, Shipment, UnitLock


def overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    return a_start < b_end and b_start < a_end


def active_locks(db: Session, unit_id: int, include_soft: bool = True) -> list[UnitLock]:
    stmt = select(UnitLock).where(UnitLock.unit_id == unit_id, UnitLock.status == "active")
    if not include_soft:
        stmt = stmt.where(UnitLock.kind == "hard")
    return list(db.scalars(stmt.order_by(UnitLock.starts_at)))


@dataclass
class UnitState:
    unit: FleetUnit
    latitude: float
    longitude: float
    free_from: datetime
    busy_lock: UnitLock | None
    last_lock: UnitLock | None  # the lock that determines the projected position

    @property
    def is_busy(self) -> bool:
        return self.busy_lock is not None


def projected_state(db: Session, unit: FleetUnit, at: datetime, now: datetime, include_soft: bool = True) -> UnitState:
    """Where will `unit` be, and from when is it free, around sim time `at`?"""
    locks = active_locks(db, unit.id, include_soft=include_soft)
    busy = None
    last_before = None
    for lock in locks:
        if lock.starts_at <= at < lock.ends_at:
            busy = lock
        if lock.ends_at <= at and (last_before is None or lock.ends_at > last_before.ends_at):
            last_before = lock
    free_from = now
    if unit.board_available_at and unit.board_available_at > free_from:
        free_from = unit.board_available_at
    lat, lon = unit.current_latitude, unit.current_longitude
    if last_before is not None:
        ship = last_before.shipment
        lat, lon = ship.destination_latitude, ship.destination_longitude
        free_from = max(free_from, last_before.ends_at)
    return UnitState(unit=unit, latitude=lat, longitude=lon, free_from=free_from, busy_lock=busy, last_lock=last_before)


def find_conflict(db: Session, unit_id: int, start: datetime, end: datetime, include_soft: bool = True, ignore_shipment_id: int | None = None) -> UnitLock | None:
    for lock in active_locks(db, unit_id, include_soft=include_soft):
        if ignore_shipment_id is not None and lock.shipment_id == ignore_shipment_id:
            continue
        if overlaps(start, end, lock.starts_at, lock.ends_at):
            return lock
    return None


@dataclass
class LockPlan:
    unit_id: int
    unit_number: str
    feasible: bool
    reason: str
    deadhead_miles: float
    from_latitude: float
    from_longitude: float
    depart_at: datetime
    starts_at: datetime
    ends_at: datetime
    pickup_at: datetime
    delivery_at: datetime
    free_from: datetime
    conflict_external_id: str | None = None
    positioned_by: str | None = None  # external id of the prior load that places the unit

    @property
    def lock_hours(self) -> float:
        return (self.ends_at - self.starts_at).total_seconds() / 3600.0

    def to_dict(self) -> dict:
        return {
            "unit_id": self.unit_id,
            "unit_number": self.unit_number,
            "feasible": self.feasible,
            "reason": self.reason,
            "deadhead_miles": self.deadhead_miles,
            "depart_at": self.depart_at.isoformat() + "Z",
            "starts_at": self.starts_at.isoformat() + "Z",
            "ends_at": self.ends_at.isoformat() + "Z",
            "free_from": self.free_from.isoformat() + "Z",
            "lock_hours": round(self.lock_hours, 1),
            "conflict_external_id": self.conflict_external_id,
            "positioned_by": self.positioned_by,
        }


def plan_lock(db: Session, unit: FleetUnit, shipment: Shipment, policy: Policy, now: datetime, include_soft: bool = True) -> LockPlan:
    state = projected_state(db, unit, shipment.pickup_at, now, include_soft=include_soft)
    deadhead = haversine_miles(state.latitude, state.longitude, shipment.origin_latitude, shipment.origin_longitude)
    depart = shipment.pickup_at - travel_time(deadhead, policy.avg_speed_mph)
    ends = shipment.delivery_at + timedelta(minutes=policy.turnaround_buffer_minutes)
    plan = LockPlan(
        unit_id=unit.id,
        unit_number=unit.unit_number,
        feasible=True,
        reason="ok",
        deadhead_miles=deadhead,
        from_latitude=state.latitude,
        from_longitude=state.longitude,
        depart_at=depart,
        starts_at=depart,
        ends_at=ends,
        pickup_at=shipment.pickup_at,
        delivery_at=shipment.delivery_at,
        free_from=state.free_from,
        positioned_by=state.last_lock.shipment.external_id if state.last_lock else None,
    )
    if unit.board_status in ("maintenance", "off_duty"):
        plan.feasible = False
        plan.reason = f"unit is {unit.board_status}"
        return plan
    if state.busy_lock is not None:
        plan.feasible = False
        plan.reason = f"busy with {state.busy_lock.shipment.external_id} at pickup time"
        plan.conflict_external_id = state.busy_lock.shipment.external_id
        return plan
    if state.free_from > depart:
        late_by = (state.free_from - depart).total_seconds() / 3600.0
        plan.feasible = False
        plan.reason = f"cannot reach pickup in time (free {late_by:.1f}h after required departure)"
        return plan
    conflict = find_conflict(db, unit.id, depart, ends, include_soft=include_soft, ignore_shipment_id=shipment.id)
    if conflict is not None:
        plan.feasible = False
        plan.reason = f"window overlaps {conflict.shipment.external_id}"
        plan.conflict_external_id = conflict.shipment.external_id
        return plan
    return plan


def create_lock(db: Session, plan: LockPlan, shipment: Shipment, kind: str, now: datetime) -> UnitLock:
    existing = db.scalar(select(UnitLock).where(UnitLock.unit_id == plan.unit_id, UnitLock.shipment_id == shipment.id))
    if existing is not None:
        existing.kind = kind
        existing.status = "active"
        existing.starts_at = plan.starts_at
        existing.depart_at = plan.depart_at
        existing.ends_at = plan.ends_at
        existing.deadhead_miles = plan.deadhead_miles
        existing.released_at = None
        existing.release_reason = None
        return existing
    lock = UnitLock(
        unit_id=plan.unit_id,
        shipment_id=shipment.id,
        kind=kind,
        status="active",
        starts_at=plan.starts_at,
        depart_at=plan.depart_at,
        pickup_at=plan.pickup_at,
        delivery_at=plan.delivery_at,
        ends_at=plan.ends_at,
        deadhead_miles=plan.deadhead_miles,
        from_latitude=plan.from_latitude,
        from_longitude=plan.from_longitude,
        created_at=now,
    )
    db.add(lock)
    return lock


def release_locks(db: Session, shipment: Shipment, reason: str, now: datetime, kinds: tuple[str, ...] = ("hard", "soft")) -> int:
    n = 0
    for lock in shipment.locks:
        if lock.status == "active" and lock.kind in kinds:
            lock.status = "released"
            lock.released_at = now
            lock.release_reason = reason
            n += 1
    return n


def units_locked_at(db: Session, unit_ids: list[int], at: datetime, include_soft: bool = True) -> set[int]:
    """Subset of `unit_ids` that have an active lock covering sim time `at`."""
    if not unit_ids:
        return set()
    stmt = select(UnitLock.unit_id).where(
        UnitLock.unit_id.in_(unit_ids),
        UnitLock.status == "active",
        UnitLock.starts_at <= at,
        UnitLock.ends_at > at,
    )
    if not include_soft:
        stmt = stmt.where(UnitLock.kind == "hard")
    return set(db.scalars(stmt))

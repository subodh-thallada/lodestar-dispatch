from datetime import timedelta

from lodestar.engine.locks import create_lock, find_conflict, overlaps, plan_lock, projected_state, release_locks
from lodestar.models import FleetUnit
from tests.conftest import NOW, make_shipment


def test_overlap_semantics():
    a, b = NOW, NOW + timedelta(hours=2)
    assert overlaps(a, b, a + timedelta(hours=1), b + timedelta(hours=1))
    assert not overlaps(a, b, b, b + timedelta(hours=1))  # touching intervals do not overlap
    assert not overlaps(a, b, a - timedelta(hours=2), a)


def test_plan_includes_deadhead_and_buffer(db, policy):
    ship = make_shipment(db)
    unit = db.get(FleetUnit, 1)
    plan = plan_lock(db, unit, ship, policy, NOW)
    assert plan.feasible
    assert plan.deadhead_miles > 0
    travel = timedelta(hours=plan.deadhead_miles / policy.avg_speed_mph)
    assert abs((ship.pickup_at - plan.depart_at) - travel) < timedelta(seconds=1)
    assert plan.ends_at == ship.delivery_at + timedelta(minutes=policy.turnaround_buffer_minutes)


def test_double_booking_is_rejected(db, policy):
    first = make_shipment(db, "LD-A", pickup_hours=4, transit_hours=12)
    unit = db.get(FleetUnit, 1)
    plan = plan_lock(db, unit, first, policy, NOW)
    create_lock(db, plan, first, "hard", NOW)
    db.commit()

    # Overlapping window on the same unit: starts while the first load is still in transit.
    second = make_shipment(db, "LD-B", pickup_hours=10, transit_hours=5)
    plan2 = plan_lock(db, unit, second, policy, NOW)
    assert not plan2.feasible
    assert plan2.conflict_external_id == "LD-A" or "busy" in plan2.reason

    # Another unit at the same hub is still fine.
    other = db.get(FleetUnit, 2)
    assert plan_lock(db, other, second, policy, NOW).feasible


def test_chained_load_uses_projected_position(db, policy):
    """After ATL->CHI the unit is in Chicago, so a CHI outbound load has ~zero deadhead and an
    ATL outbound load would need a 600-mile empty move (infeasible / expensive)."""
    first = make_shipment(db, "LD-A", origin="ATL", dest="CHI", pickup_hours=2, transit_hours=12)
    unit = db.get(FleetUnit, 1)
    create_lock(db, plan_lock(db, unit, first, policy, NOW), first, "hard", NOW)
    db.commit()

    after = first.delivery_at + timedelta(hours=policy.turnaround_buffer_minutes / 60 + 6)
    chi_out = make_shipment(db, "LD-B", origin="CHI", dest="DFW", pickup_hours=(after - NOW).total_seconds() / 3600)
    plan = plan_lock(db, unit, chi_out, policy, NOW)
    assert plan.feasible
    assert plan.deadhead_miles < 15
    assert plan.positioned_by == "LD-A"

    atl_out = make_shipment(db, "LD-C", origin="ATL", dest="DFW", pickup_hours=(after - NOW).total_seconds() / 3600)
    plan_atl = plan_lock(db, unit, atl_out, policy, NOW)
    # 600 miles at 50 mph is 12h of travel; the unit frees up only ~7h before pickup.
    assert not plan_atl.feasible
    assert "cannot reach pickup" in plan_atl.reason


def test_release_frees_the_window(db, policy):
    ship = make_shipment(db, "LD-A")
    unit = db.get(FleetUnit, 1)
    plan = plan_lock(db, unit, ship, policy, NOW)
    create_lock(db, plan, ship, "hard", NOW)
    db.commit()
    assert find_conflict(db, unit.id, plan.starts_at, plan.ends_at) is not None
    assert release_locks(db, ship, "completed", NOW) == 1
    db.commit()
    assert find_conflict(db, unit.id, plan.starts_at, plan.ends_at) is None


def test_soft_lock_counts_only_when_requested(db, policy):
    ship = make_shipment(db, "LD-A")
    unit = db.get(FleetUnit, 1)
    plan = plan_lock(db, unit, ship, policy, NOW)
    create_lock(db, plan, ship, "soft", NOW)
    db.commit()
    state_soft = projected_state(db, unit, ship.pickup_at + timedelta(hours=1), NOW, include_soft=True)
    state_hard = projected_state(db, unit, ship.pickup_at + timedelta(hours=1), NOW, include_soft=False)
    assert state_soft.is_busy
    assert not state_hard.is_busy

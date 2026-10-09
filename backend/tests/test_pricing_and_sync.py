from datetime import timedelta
from pathlib import Path

import pytest

from lodestar.config import settings
from lodestar.engine.history import LaneIndex, load_history_file
from lodestar.engine.locks import active_locks
from lodestar.engine.pricing import PricingModel
from lodestar.ingest.sync import apply_transition, upsert_order
from lodestar.models import FleetUnit, Shipment
from tests.conftest import HUBS, NOW

REAL_CSV = Path(settings.history_csv)


@pytest.fixture(scope="module")
def real_index():
    if not REAL_CSV.exists():
        pytest.skip("board history CSV not present (git submodule not initialised)")
    return LaneIndex(load_history_file(REAL_CSV))


def test_history_summary_and_lane_lookup(real_index):
    s = real_index.summary()
    assert s["rows"] == 2500
    assert s["lanes"] > 50
    rpm, basis, n = real_index.market_rpm("ATL", "CHI", 600)
    assert basis == "lane" and n >= 5 and 1.5 < rpm < 4.5
    rpm2, basis2, _ = real_index.market_rpm("ZZZ", "YYY", 2000)
    assert basis2 in ("band", "global") and rpm2 > 1.5


def test_pricing_model_is_better_than_chance_and_monotone(real_index):
    pm = PricingModel(real_index)
    assert pm.metrics.auc > 0.6
    assert pm.metrics.coefficients["gap"] < 0  # bidding above market lowers P(win)
    kw = dict(origin_code="ATL", destination_code="CHI", miles=600, weight_lbs=40_000, season="fall")
    p_low = pm.win_probability(1200, **kw)
    p_high = pm.win_probability(2400, **kw)
    assert p_low > p_high
    out = pm.suggest_bid(total_cost=1100, min_margin_usd=150, min_margin_pct=0.10, target_margin_pct=0.18, **kw)
    assert out["suggested_bid"] >= out["floor_bid"]
    assert out["expected_profit"] > 0
    assert len(out["ev_curve"]) >= 10


def _order(ext="LD-SYNC001", status="open", **over):
    o_lat, o_lon = HUBS["ATL"]
    d_lat, d_lon = HUBS["CHI"]
    base = {
        "id": 42,
        "external_id": ext,
        "order_type": "fixed_rate",
        "status": status,
        "origin_city": "Atlanta",
        "origin_state": "GA",
        "origin_latitude": o_lat + 0.1,
        "origin_longitude": o_lon,
        "origin_terminal_code": "ATL",
        "destination_city": "Chicago",
        "destination_state": "IL",
        "destination_latitude": d_lat,
        "destination_longitude": d_lon,
        "destination_terminal_code": "CHI",
        "distance_miles": 600.0,
        "weight_lbs": 40_000,
        "offered_rate": 2000.0,
        "cost_per_mile": 1.8,
        "estimated_cost": 1080.0,
        "estimated_deadhead_miles": 6.0,
        "estimated_deadhead_cost": 10.8,
        "pickup_at": (NOW + timedelta(hours=3)).isoformat(),
        "delivery_at": (NOW + timedelta(hours=16)).isoformat(),
        "expires_at": (NOW + timedelta(minutes=10)).isoformat(),
        "created_at": NOW.isoformat(),
        "assigned_driver_id": None,
        "assigned_terminal_code": None,
        "bid_decision_at": None,
        "winning_bid_rate": None,
    }
    base.update(over)
    return base


def test_upsert_resolves_hubs_and_transitions_create_and_release_locks(db, policy):
    ship, old, new = upsert_order(db, _order(), NOW)
    db.flush()
    assert old is None and new == "open"
    assert ship.origin_hub_code == "ATL" and ship.destination_hub_code == "CHI" and ship.lane_id == "ATL-CHI"

    # Off-hub pickup resolves to the nearest hub even with no terminal code.
    off, _, _ = upsert_order(db, _order("LD-OFF", origin_terminal_code=None, origin_latitude=33.9, origin_longitude=-84.1), NOW)
    assert off.origin_hub_code == "ATL"

    # Board accepts and binds unit 2 -> hard lock, booking economics filled in.
    ship, old, new = upsert_order(db, _order(status="accepted", assigned_driver_id=2, assigned_terminal_code="ATL"), NOW)
    events = apply_transition(db, ship, old, new, policy, NOW)
    db.commit()
    assert any(e.startswith("lock.created") for e in events)
    assert ship.payout == 2000.0
    assert ship.booked_total_cost > ship.estimated_cost
    assert ship.booked_margin == pytest.approx(2000.0 - ship.booked_total_cost)
    assert len(active_locks(db, 2)) == 1

    # Delivery completes -> lock released, unit re-homed to the destination hub.
    ship, old, new = upsert_order(db, _order(status="completed", assigned_driver_id=2, assigned_terminal_code="ATL"), NOW)
    apply_transition(db, ship, old, new, policy, NOW)
    db.commit()
    assert active_locks(db, 2) == []
    unit = db.get(FleetUnit, 2)
    assert unit.home_terminal_code == "CHI"
    assert unit.current_latitude == pytest.approx(HUBS["CHI"][0])


def test_lost_bid_releases_soft_lock(db, policy):
    ship, _, _ = upsert_order(db, _order("LD-BID", order_type="open_bid", offered_rate=None, status="bid_submitted", winning_bid_rate=1900.0), NOW)
    db.flush()
    from lodestar.engine.locks import create_lock, plan_lock

    unit = db.get(FleetUnit, 1)
    create_lock(db, plan_lock(db, unit, ship, policy, NOW), ship, "soft", NOW)
    db.commit()
    assert len(active_locks(db, 1)) == 1
    ship, old, new = upsert_order(db, _order("LD-BID", order_type="open_bid", offered_rate=None, status="bid_lost", winning_bid_rate=1900.0), NOW)
    apply_transition(db, ship, old, new, policy, NOW)
    db.commit()
    assert active_locks(db, 1) == []
    assert db.query(Shipment).filter_by(external_id="LD-BID").one().board_status == "bid_lost"

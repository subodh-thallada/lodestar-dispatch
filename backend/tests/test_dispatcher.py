from datetime import timedelta

import pytest

from lodestar.engine.dispatcher import evaluate, hub_capacity, predicted_board_unit
from lodestar.engine.history import LaneIndex, parse_history_csv
from lodestar.engine.locks import create_lock, plan_lock
from lodestar.engine.policy import update_policy
from lodestar.engine.pricing import PricingModel
from lodestar.models import FleetUnit
from tests.conftest import NOW, make_shipment

HISTORY_CSV = """shipment_id,lane_id,origin_city,origin_state,origin_latitude,origin_longitude,destination_city,destination_state,destination_latitude,destination_longitude,distance_miles,weight_lbs,order_type,offered_rate,bid_rate,won,cost_per_mile,estimated_cost,margin_estimate,shipped_at,market_rpm,all_in_rpm,fuel_surcharge_rpm,season,booked_lead_hours
"""


def _synthetic_history(n_per_lane: int = 40) -> LaneIndex:
    import random

    rng = random.Random(3)
    lines = [HISTORY_CSV.strip()]
    i = 0
    for lane, miles, rpm in (("ATL-CHI", 600, 2.6), ("CHI-ATL", 600, 2.4), ("ATL-DFW", 720, 2.5), ("DFW-CHI", 900, 2.7), ("CHI-DFW", 900, 2.3)):
        o, d = lane.split("-")
        for _ in range(n_per_lane):
            i += 1
            all_in = rpm * rng.uniform(0.95, 1.05)
            cpm = 1.8
            if rng.random() < 0.5:
                otype, offered, bid = "fixed_rate", round(miles * all_in * rng.uniform(0.9, 1.1), 2), ""
                won = rng.random() < 0.5
                payout = offered
            else:
                bid_rpm = all_in * rng.choice([0.9, 0.95, 1.0, 1.05, 1.15])
                otype, offered, bid = "open_bid", round(miles * all_in, 2), round(miles * bid_rpm, 2)
                gap = (bid_rpm - all_in) / all_in
                won = rng.random() < 1 / (1 + pow(2.718, 8 * gap - 0.2))
                payout = bid
            margin = round(payout - miles * cpm, 2) if won else ""
            lines.append(
                f"HS-{i:05d},{lane},{o},XX,0,0,{d},XX,0,0,{miles},40000,{otype},{offered},{bid},{'true' if won else 'false'},{cpm},{miles * cpm},{margin},2026-03-0{1 + i % 9} 10:00:00,{all_in:.3f},{all_in:.3f},0.4,spring,24"
            )
    return LaneIndex(parse_history_csv("\n".join(lines)))


@pytest.fixture(scope="module")
def index():
    return _synthetic_history()


@pytest.fixture(scope="module")
def pricing(index):
    return PricingModel(index)


def test_profitable_fixed_rate_is_accept(db, policy, index, pricing):
    ship = make_shipment(db, offered_rate=2000.0, miles=600, cpm=1.8)  # loaded cost 1080
    ev = evaluate(db, ship, policy, index, pricing, NOW)
    assert ev.recommendation == "accept"
    assert ev.bookable
    assert ev.margin > 800
    assert ev.predicted_unit is not None
    assert ev.total_cost == pytest.approx(ev.loaded_cost + ev.deadhead_cost)


def test_thin_margin_is_decline(db, policy, index, pricing):
    ship = make_shipment(db, offered_rate=1150.0, miles=600, cpm=1.8)  # ~$60 margin before deadhead
    ev = evaluate(db, ship, policy, index, pricing, NOW)
    assert ev.recommendation == "decline"
    failed = {g.name for g in ev.guardrails if not g.passed}
    assert failed == {"margin"}
    assert any("below policy" in r for r in ev.reasons)


def test_overweight_is_not_overridable(db, policy, index, pricing):
    ship = make_shipment(db, weight=48_000)
    ev = evaluate(db, ship, policy, index, pricing, NOW)
    weight = next(g for g in ev.guardrails if g.name == "weight")
    assert not weight.passed and not weight.overridable
    assert ev.recommendation == "decline"


def test_no_capacity_is_hold(db, policy, index, pricing):
    # Put every usable ATL unit on a load that overlaps the new pickup window.
    for i, uid in enumerate((1, 2)):
        busy = make_shipment(db, f"LD-BUSY{i}", pickup_hours=1, transit_hours=20)
        unit = db.get(FleetUnit, uid)
        unit.board_status = "assigned"
        unit.board_available_at = busy.delivery_at
        create_lock(db, plan_lock(db, unit, busy, policy, NOW), busy, "hard", NOW)
    db.commit()
    ship = make_shipment(db, "LD-NEW", pickup_hours=4)
    ev = evaluate(db, ship, policy, index, pricing, NOW)
    assert ev.recommendation == "hold"
    assert any(g.name == "capacity" and not g.passed for g in ev.guardrails)
    assert predicted_board_unit(db, ship) is None


def test_reserve_floor_holds_last_unit(db, policy, index, pricing):
    update_policy(db, {"reserve_units_per_terminal": 1})
    policy = __import__("lodestar.engine.policy", fromlist=["load_policy"]).load_policy(db)
    busy = make_shipment(db, "LD-BUSY", pickup_hours=1, transit_hours=20)
    unit = db.get(FleetUnit, 1)
    unit.board_status = "assigned"
    unit.board_available_at = busy.delivery_at
    create_lock(db, plan_lock(db, unit, busy, policy, NOW), busy, "hard", NOW)
    db.commit()
    cap = hub_capacity(db, "ATL", NOW + timedelta(hours=4), policy)
    assert cap.projected_free == 1
    ship = make_shipment(db, "LD-NEW", pickup_hours=4)
    ev = evaluate(db, ship, policy, index, pricing, NOW)
    assert ev.recommendation == "hold"
    assert any(g.name == "reserve" and not g.passed for g in ev.guardrails)


def test_open_bid_gets_suggested_bid_above_floor(db, policy, index, pricing):
    ship = make_shipment(db, order_type="open_bid", miles=600, cpm=1.8)
    ev = evaluate(db, ship, policy, index, pricing, NOW)
    assert ev.recommendation == "bid"
    assert ev.pricing is not None
    p = ev.pricing
    assert p["suggested_bid"] >= p["floor_bid"]
    assert p["floor_bid"] >= ev.total_cost * (1 + policy.min_margin_pct)
    assert 0.0 < p["win_probability"] < 1.0
    assert ev.payout == p["suggested_bid"]


def test_deadhead_cap_blocks_far_pickup(db, policy, index, pricing):
    # Pickup ~190 miles from the ATL hub (2.75 degrees of latitude north).
    ship = make_shipment(db, origin_offset=(2.75, 0.0), offered_rate=2600.0)
    ev = evaluate(db, ship, policy, index, pricing, NOW)
    assert ev.deadhead_miles > policy.max_deadhead_miles
    assert any(g.name == "deadhead" and not g.passed for g in ev.guardrails)
    assert ev.recommendation == "decline"


def test_score_rewards_delivering_into_scarce_hub(db, policy, index, pricing):
    # Empty out CHI so a load delivering into CHI earns a chaining bonus.
    for uid in (4, 5):
        unit = db.get(FleetUnit, uid)
        far = make_shipment(db, f"LD-OUT{uid}", origin="CHI", dest="DFW", pickup_hours=1, transit_hours=30)
        unit.board_status = "assigned"
        unit.board_available_at = far.delivery_at
        create_lock(db, plan_lock(db, unit, far, policy, NOW), far, "hard", NOW)
    db.commit()
    into_chi = make_shipment(db, "LD-IN", origin="ATL", dest="CHI")
    ev = evaluate(db, into_chi, policy, index, pricing, NOW)
    assert ev.chain_value > 0
    assert ev.score > ev.margin - ev.drain_penalty

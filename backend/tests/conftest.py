"""Shared fixtures: an in-memory Lodestar DB with two hubs, a few units and a policy."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlalchemy.orm import sessionmaker

from lodestar.db import Base, make_engine
from lodestar.engine.policy import load_policy
from lodestar.models import FleetUnit, Shipment, Terminal

NOW = datetime(2026, 10, 9, 12, 0, 0)

HUBS = {
    "ATL": (33.6407, -84.4277),
    "CHI": (41.9742, -87.9073),
    "DFW": (32.8998, -97.0403),
}


@pytest.fixture()
def db():
    engine = make_engine("sqlite://")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    s = Session()
    for i, (code, (lat, lon)) in enumerate(HUBS.items(), start=1):
        s.add(Terminal(code=code, board_id=i, name=f"{code} Terminal", city=code, state="XX", latitude=lat, longitude=lon, unit_capacity=3))
    s.flush()
    uid = 1
    for code, (lat, lon) in HUBS.items():
        for n in range(1, 4):
            s.add(
                FleetUnit(
                    id=uid,
                    unit_number=f"{code}-U{n:03d}",
                    employee_code=f"{code}-D{n:03d}",
                    driver_name=f"Driver {uid}",
                    home_terminal_code=code,
                    board_status="available" if n < 3 else "maintenance",
                    current_latitude=lat + 0.05 * n,
                    current_longitude=lon - 0.05 * n,
                    board_available_at=None,
                    last_synced_at=NOW,
                )
            )
            uid += 1
    s.commit()
    yield s
    s.close()


@pytest.fixture()
def policy(db):
    return load_policy(db)


def make_shipment(
    db,
    external_id="LD-TEST0001",
    origin="ATL",
    dest="CHI",
    order_type="fixed_rate",
    offered_rate=2000.0,
    miles=600.0,
    weight=38_000,
    cpm=1.8,
    pickup_hours=4.0,
    transit_hours=12.0,
    origin_offset=(0.0, 0.0),
    status="open",
) -> Shipment:
    o_lat, o_lon = HUBS[origin]
    d_lat, d_lon = HUBS[dest]
    pickup = NOW + timedelta(hours=pickup_hours)
    s = Shipment(
        external_id=external_id,
        board_id=hash(external_id) % 100000,
        order_type=order_type,
        board_status=status,
        origin_city=origin,
        origin_state="XX",
        origin_latitude=o_lat + origin_offset[0],
        origin_longitude=o_lon + origin_offset[1],
        origin_terminal_code=origin,
        origin_hub_code=origin,
        destination_city=dest,
        destination_state="XX",
        destination_latitude=d_lat,
        destination_longitude=d_lon,
        destination_terminal_code=dest,
        destination_hub_code=dest,
        lane_id=f"{origin}-{dest}",
        distance_miles=miles,
        weight_lbs=weight,
        offered_rate=offered_rate if order_type == "fixed_rate" else None,
        cost_per_mile=cpm,
        estimated_cost=round(miles * cpm, 2),
        board_deadhead_miles=5.0,
        board_deadhead_cost=9.0,
        pickup_at=pickup,
        delivery_at=pickup + timedelta(hours=transit_hours),
        expires_at=NOW + timedelta(minutes=10),
        board_created_at=NOW,
        first_seen_at=NOW,
        last_seen_at=NOW,
    )
    db.add(s)
    db.commit()
    return s

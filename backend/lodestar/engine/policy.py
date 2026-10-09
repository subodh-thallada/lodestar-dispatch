"""Live-tunable dispatch policy (single DB row, seeded from process settings)."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from lodestar.config import settings
from lodestar.models import PolicySettings

AUTOPILOT_MODES = ("off", "advise", "execute")


@dataclass
class Policy:
    min_margin_usd: float
    min_margin_pct: float
    max_deadhead_miles: float
    reserve_units_per_terminal: int
    target_bid_margin_pct: float
    avg_speed_mph: float
    turnaround_buffer_minutes: int
    chain_weight: float
    count_pending_bids_against_capacity: bool
    autopilot_mode: str
    autopilot_auto_decline: bool
    max_weight_lbs: int

    def to_dict(self) -> dict:
        return asdict(self)


FIELDS = tuple(Policy.__dataclass_fields__.keys())


def _defaults() -> dict:
    return {
        "min_margin_usd": settings.min_margin_usd,
        "min_margin_pct": settings.min_margin_pct,
        "max_deadhead_miles": settings.max_deadhead_miles,
        "reserve_units_per_terminal": settings.reserve_units_per_terminal,
        "target_bid_margin_pct": settings.target_bid_margin_pct,
        "avg_speed_mph": settings.avg_speed_mph,
        "turnaround_buffer_minutes": settings.turnaround_buffer_minutes,
        "chain_weight": settings.chain_weight,
        "count_pending_bids_against_capacity": settings.count_pending_bids_against_capacity,
        "autopilot_mode": settings.autopilot_mode,
        "autopilot_auto_decline": settings.autopilot_auto_decline,
        "max_weight_lbs": 44_000,
    }


def load_policy(db: Session) -> Policy:
    row = db.get(PolicySettings, 1)
    if row is None:
        row = PolicySettings(id=1, updated_at=datetime.utcnow(), **_defaults())
        db.add(row)
        db.commit()
    return Policy(**{f: getattr(row, f) for f in FIELDS})


def update_policy(db: Session, changes: dict) -> Policy:
    row = db.get(PolicySettings, 1)
    if row is None:
        load_policy(db)
        row = db.get(PolicySettings, 1)
    for key, value in changes.items():
        if key not in FIELDS or value is None:
            continue
        if key == "autopilot_mode" and value not in AUTOPILOT_MODES:
            raise ValueError(f"autopilot_mode must be one of {AUTOPILOT_MODES}")
        setattr(row, key, value)
    row.updated_at = datetime.utcnow()
    db.commit()
    return Policy(**{f: getattr(row, f) for f in FIELDS})

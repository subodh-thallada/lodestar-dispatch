"""Lodestar's own relational schema.

The board (external load board) is the *sandbox truth* for which unit it bound to a
booking and when capacity physically moves. Everything else — shipment lifecycle as we
see it, temporal locks with deadhead travel baked in, decisions and their reasoning,
inventory history, policy — is owned here.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from lodestar.db import Base


class Terminal(Base):
    """Regional hub. Mirrored from the board; `reserve_units` is our own policy knob."""

    __tablename__ = "terminals"

    code: Mapped[str] = mapped_column(String(8), primary_key=True)
    board_id: Mapped[int] = mapped_column(Integer, unique=True)
    name: Mapped[str] = mapped_column(String(100))
    city: Mapped[str] = mapped_column(String(80))
    state: Mapped[str] = mapped_column(String(2))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    unit_capacity: Mapped[int] = mapped_column(Integer, default=0)

    units: Mapped[list[FleetUnit]] = relationship(back_populates="home_terminal")


class FleetUnit(Base):
    """One bookable asset = driver + truck. `id` is the board's unit id so joins are stable."""

    __tablename__ = "fleet_units"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    unit_number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    employee_code: Mapped[str] = mapped_column(String(20), unique=True)
    driver_name: Mapped[str] = mapped_column(String(120))
    home_terminal_code: Mapped[str] = mapped_column(ForeignKey("terminals.code"), index=True)
    board_status: Mapped[str] = mapped_column(String(20), default="available")  # available|assigned|off_duty|maintenance
    current_latitude: Mapped[float] = mapped_column(Float)
    current_longitude: Mapped[float] = mapped_column(Float)
    board_available_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(DateTime)

    home_terminal: Mapped[Terminal] = relationship(back_populates="units")
    locks: Mapped[list[UnitLock]] = relationship(back_populates="unit", cascade="all, delete-orphan")


class Shipment(Base):
    """A load opportunity as Lodestar sees it (board order + our evaluation + booking state)."""

    __tablename__ = "shipments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    external_id: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    board_id: Mapped[int] = mapped_column(Integer)
    order_type: Mapped[str] = mapped_column(String(20), index=True)  # fixed_rate | open_bid
    board_status: Mapped[str] = mapped_column(String(20), index=True)  # open|accepted|in_transit|completed|bid_submitted|bid_lost|expired|declined

    origin_city: Mapped[str] = mapped_column(String(80))
    origin_state: Mapped[str] = mapped_column(String(2))
    origin_latitude: Mapped[float] = mapped_column(Float)
    origin_longitude: Mapped[float] = mapped_column(Float)
    origin_terminal_code: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    origin_hub_code: Mapped[str] = mapped_column(String(8), index=True)  # resolved nearest hub (never null)
    destination_city: Mapped[str] = mapped_column(String(80))
    destination_state: Mapped[str] = mapped_column(String(2))
    destination_latitude: Mapped[float] = mapped_column(Float)
    destination_longitude: Mapped[float] = mapped_column(Float)
    destination_terminal_code: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    destination_hub_code: Mapped[str] = mapped_column(String(8), index=True)
    lane_id: Mapped[str] = mapped_column(String(20), index=True)

    distance_miles: Mapped[float] = mapped_column(Float)
    weight_lbs: Mapped[int] = mapped_column(Integer)
    offered_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cost_per_mile: Mapped[float] = mapped_column(Float)
    estimated_cost: Mapped[float] = mapped_column(Float)
    board_deadhead_miles: Mapped[float] = mapped_column(Float, default=0.0)
    board_deadhead_cost: Mapped[float] = mapped_column(Float, default=0.0)

    pickup_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    delivery_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    board_created_at: Mapped[datetime] = mapped_column(DateTime)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Booking outcome
    our_bid_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    bid_decision_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    assigned_unit_id: Mapped[Optional[int]] = mapped_column(ForeignKey("fleet_units.id"), nullable=True, index=True)
    assigned_terminal_code: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    booked_by: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # dispatcher | autopilot
    booked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    payout: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # offered_rate or winning bid
    booked_deadhead_miles: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    booked_deadhead_cost: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    booked_total_cost: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    booked_margin: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Cached latest evaluation (refreshed on every ingest tick while open)
    eval_recommendation: Mapped[Optional[str]] = mapped_column(String(12), nullable=True, index=True)
    eval_margin: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    eval_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    eval_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    evaluated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    autopilot_handled: Mapped[bool] = mapped_column(Boolean, default=False)

    assigned_unit: Mapped[Optional[FleetUnit]] = relationship()
    locks: Mapped[list[UnitLock]] = relationship(back_populates="shipment", cascade="all, delete-orphan")
    decisions: Mapped[list[Decision]] = relationship(back_populates="shipment", cascade="all, delete-orphan")


class UnitLock(Base):
    """Temporal resource lock: unit `unit_id` is committed to `shipment_id` during [starts_at, ends_at).

    starts_at includes the empty (deadhead) move to the pickup; ends_at includes the
    turnaround buffer after delivery. `kind='soft'` marks exposure from an outstanding
    open bid (counted against capacity, released if the bid is lost).
    """

    __tablename__ = "unit_locks"
    __table_args__ = (
        Index("ix_unit_locks_window", "unit_id", "starts_at", "ends_at"),
        UniqueConstraint("unit_id", "shipment_id", name="uq_unit_shipment_lock"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    unit_id: Mapped[int] = mapped_column(ForeignKey("fleet_units.id"), index=True)
    shipment_id: Mapped[int] = mapped_column(ForeignKey("shipments.id"), index=True)
    kind: Mapped[str] = mapped_column(String(8), default="hard")  # hard | soft
    status: Mapped[str] = mapped_column(String(10), default="active", index=True)  # active | released
    starts_at: Mapped[datetime] = mapped_column(DateTime)
    depart_at: Mapped[datetime] = mapped_column(DateTime)  # when the unit must leave for the pickup
    pickup_at: Mapped[datetime] = mapped_column(DateTime)
    delivery_at: Mapped[datetime] = mapped_column(DateTime)
    ends_at: Mapped[datetime] = mapped_column(DateTime)
    deadhead_miles: Mapped[float] = mapped_column(Float, default=0.0)
    from_latitude: Mapped[float] = mapped_column(Float)
    from_longitude: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    released_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    release_reason: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)

    unit: Mapped[FleetUnit] = relationship(back_populates="locks")
    shipment: Mapped[Shipment] = relationship(back_populates="locks")


class Decision(Base):
    """Decision ledger: every accept / decline / bid / skip, who made it, and why."""

    __tablename__ = "decisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    shipment_id: Mapped[int] = mapped_column(ForeignKey("shipments.id"), index=True)
    external_id: Mapped[str] = mapped_column(String(40), index=True)
    actor: Mapped[str] = mapped_column(String(20))  # dispatcher | autopilot
    action: Mapped[str] = mapped_column(String(12))  # accept | decline | bid | skip
    outcome: Mapped[str] = mapped_column(String(12))  # ok | rejected | blocked | error
    bid_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    expected_margin: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    deadhead_miles: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    override: Mapped[bool] = mapped_column(Boolean, default=False)
    guardrails: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    reasons: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    board_status_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    sim_time: Mapped[datetime] = mapped_column(DateTime)

    shipment: Mapped[Shipment] = relationship(back_populates="decisions")


class InventorySnapshot(Base):
    """Real-time terminal inventory, sampled every fleet sync (feeds utilization history)."""

    __tablename__ = "inventory_snapshots"
    __table_args__ = (Index("ix_inventory_terminal_time", "terminal_code", "sim_time"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    terminal_code: Mapped[str] = mapped_column(ForeignKey("terminals.code"))
    sim_time: Mapped[datetime] = mapped_column(DateTime)
    total_units: Mapped[int] = mapped_column(Integer)
    available_units: Mapped[int] = mapped_column(Integer)
    assigned_units: Mapped[int] = mapped_column(Integer)
    soft_locked_units: Mapped[int] = mapped_column(Integer, default=0)


class LaneStat(Base):
    """Aggregates from the historical dataset, recomputed at boot."""

    __tablename__ = "lane_stats"

    lane_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    origin_code: Mapped[str] = mapped_column(String(8), index=True)
    destination_code: Mapped[str] = mapped_column(String(8), index=True)
    shipments: Mapped[int] = mapped_column(Integer)
    wins: Mapped[int] = mapped_column(Integer)
    win_rate: Mapped[float] = mapped_column(Float)
    avg_distance_miles: Mapped[float] = mapped_column(Float)
    median_market_rpm: Mapped[float] = mapped_column(Float)
    median_all_in_rpm: Mapped[float] = mapped_column(Float)
    avg_cost_per_mile: Mapped[float] = mapped_column(Float)
    avg_margin_won: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    avg_margin_pct_won: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    fixed_rate_accept_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    open_bid_win_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)


class PolicySettings(Base):
    """Single-row table of live-tunable dispatch policy."""

    __tablename__ = "policy_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    min_margin_usd: Mapped[float] = mapped_column(Float)
    min_margin_pct: Mapped[float] = mapped_column(Float)
    max_deadhead_miles: Mapped[float] = mapped_column(Float)
    reserve_units_per_terminal: Mapped[int] = mapped_column(Integer)
    target_bid_margin_pct: Mapped[float] = mapped_column(Float)
    avg_speed_mph: Mapped[float] = mapped_column(Float)
    turnaround_buffer_minutes: Mapped[int] = mapped_column(Integer)
    chain_weight: Mapped[float] = mapped_column(Float)
    count_pending_bids_against_capacity: Mapped[bool] = mapped_column(Boolean)
    autopilot_mode: Mapped[str] = mapped_column(String(10))
    autopilot_auto_decline: Mapped[bool] = mapped_column(Boolean)
    max_weight_lbs: Mapped[int] = mapped_column(Integer, default=44_000)
    updated_at: Mapped[datetime] = mapped_column(DateTime)


class BoardEvent(Base):
    """Ingestion audit trail (bounded by a periodic trim)."""

    __tablename__ = "board_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source: Mapped[str] = mapped_column(String(10))  # ws | poll | boot
    event: Mapped[str] = mapped_column(String(30), index=True)
    external_id: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime, index=True)

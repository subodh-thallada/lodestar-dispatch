"""Dispatch engine: evaluate a load, enforce guardrails, score it, and book it.

Evaluation answers four questions for every open load:

1. **Can we physically do it?**  Is there a unit at the booking hub that the board will
   hand us, and does *our* stricter lock model (deadhead travel + no window overlap,
   projected position) agree it is feasible?
2. **Is it worth doing?**  payout - (loaded cost + deadhead cost) against policy
   minimums, in dollars and in percent, plus margin per locked hour.
3. **Where does it leave the network?**  A chaining term rewards delivering a truck
   into a hub that is short of capacity and historically pays well outbound, and
   penalises draining a hub that is already thin.
4. **What should we bid?**  For open bids, the pricing model's EV-optimal bid above a
   cost-plus floor.

`score = margin + chain_value - drain_penalty` ranks loads for auto-pilot; the
recommendation (accept / decline / bid / hold / skip) is what the dispatcher sees.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from lodestar.engine.geo import haversine_miles
from lodestar.engine.history import LaneIndex, season_of
from lodestar.engine.locks import LockPlan, plan_lock, units_locked_at
from lodestar.engine.policy import Policy
from lodestar.engine.pricing import PricingModel
from lodestar.models import FleetUnit, Shipment, Terminal

log = logging.getLogger("lodestar.dispatcher")


@dataclass
class Guardrail:
    name: str
    passed: bool
    detail: str
    overridable: bool = True

    def to_dict(self) -> dict:
        return {"name": self.name, "passed": self.passed, "detail": self.detail, "overridable": self.overridable}


@dataclass
class HubCapacity:
    code: str
    total: int
    usable: int  # excludes maintenance / off-duty
    board_free: int  # what the board will hand out for this pickup window
    projected_free: int  # our model: not hard/soft locked around the pickup
    soft_locked: int
    reserve: int

    def to_dict(self) -> dict:
        return self.__dict__.copy()


@dataclass
class Evaluation:
    external_id: str
    order_type: str
    recommendation: str  # accept | decline | bid | hold | skip
    guardrails: list[Guardrail]
    reasons: list[str]
    payout: float | None
    loaded_cost: float
    deadhead_miles: float
    deadhead_cost: float
    total_cost: float
    margin: float | None
    margin_pct: float | None
    margin_per_hour: float | None
    lock_hours: float | None
    chain_value: float
    drain_penalty: float
    score: float | None
    predicted_unit: dict | None
    best_unit: dict | None
    candidates: list[dict]
    origin_capacity: HubCapacity | None
    destination_capacity: HubCapacity | None
    market: dict
    pricing: dict | None
    board_deadhead_miles: float
    seconds_remaining: int
    evaluated_at: datetime
    extra: dict = field(default_factory=dict)

    @property
    def hard_failures(self) -> list[Guardrail]:
        return [g for g in self.guardrails if not g.passed]

    @property
    def bookable(self) -> bool:
        return not self.hard_failures

    def to_dict(self) -> dict:
        return {
            "external_id": self.external_id,
            "order_type": self.order_type,
            "recommendation": self.recommendation,
            "bookable": self.bookable,
            "guardrails": [g.to_dict() for g in self.guardrails],
            "reasons": self.reasons,
            "payout": self.payout,
            "loaded_cost": round(self.loaded_cost, 2),
            "deadhead_miles": round(self.deadhead_miles, 1),
            "deadhead_cost": round(self.deadhead_cost, 2),
            "total_cost": round(self.total_cost, 2),
            "margin": None if self.margin is None else round(self.margin, 2),
            "margin_pct": None if self.margin_pct is None else round(self.margin_pct, 4),
            "margin_per_hour": None if self.margin_per_hour is None else round(self.margin_per_hour, 2),
            "lock_hours": None if self.lock_hours is None else round(self.lock_hours, 1),
            "chain_value": round(self.chain_value, 2),
            "drain_penalty": round(self.drain_penalty, 2),
            "score": None if self.score is None else round(self.score, 2),
            "predicted_unit": self.predicted_unit,
            "best_unit": self.best_unit,
            "candidates": self.candidates,
            "origin_capacity": self.origin_capacity.to_dict() if self.origin_capacity else None,
            "destination_capacity": self.destination_capacity.to_dict() if self.destination_capacity else None,
            "market": self.market,
            "pricing": self.pricing,
            "board_deadhead_miles": self.board_deadhead_miles,
            "seconds_remaining": self.seconds_remaining,
            "evaluated_at": self.evaluated_at.isoformat() + "Z",
            **self.extra,
        }


# --- capacity helpers --------------------------------------------------------------


def hub_units(db: Session, hub_code: str) -> list[FleetUnit]:
    return list(db.scalars(select(FleetUnit).where(FleetUnit.home_terminal_code == hub_code).order_by(FleetUnit.unit_number)))


def board_free(unit: FleetUnit, at: datetime) -> bool:
    """Mirror of the board's `is_unit_free`: what it will consider bookable at `at`."""
    if unit.board_status in ("maintenance", "off_duty"):
        return False
    if unit.board_status == "available":
        return True
    return unit.board_available_at is not None and unit.board_available_at <= at


def predicted_board_unit(db: Session, shipment: Shipment, at: datetime | None = None) -> FleetUnit | None:
    """Which unit the board will bind if we book now: nearest board-free unit at the hub."""
    at = at or shipment.pickup_at
    free = [u for u in hub_units(db, shipment.origin_hub_code) if board_free(u, at)]
    if not free:
        return None
    return min(free, key=lambda u: haversine_miles(u.current_latitude, u.current_longitude, shipment.origin_latitude, shipment.origin_longitude))


def hub_capacity(db: Session, hub_code: str, at: datetime, policy: Policy, exclude_shipment_id: int | None = None) -> HubCapacity:
    units = hub_units(db, hub_code)
    ids = [u.id for u in units]
    locked = units_locked_at(db, ids, at, include_soft=policy.count_pending_bids_against_capacity)
    soft = units_locked_at(db, ids, at, include_soft=True) - units_locked_at(db, ids, at, include_soft=False)
    usable = [u for u in units if u.board_status not in ("maintenance", "off_duty")]
    bfree = sum(1 for u in usable if board_free(u, at))
    pfree = sum(1 for u in usable if board_free(u, at) and u.id not in locked)
    return HubCapacity(code=hub_code, total=len(units), usable=len(usable), board_free=bfree, projected_free=pfree, soft_locked=len(soft), reserve=policy.reserve_units_per_terminal)


# --- evaluation ----------------------------------------------------------------------


def evaluate(db: Session, shipment: Shipment, policy: Policy, index: LaneIndex, pricing: PricingModel | None, now: datetime) -> Evaluation:
    guardrails: list[Guardrail] = []
    reasons: list[str] = []
    seconds_remaining = max(0, int((shipment.expires_at - now).total_seconds()))

    # 1. Board-enforced constraints we check first so the UI never has to learn from a 409.
    overweight = shipment.weight_lbs > policy.max_weight_lbs
    guardrails.append(
        Guardrail(
            "weight",
            not overweight,
            f"{shipment.weight_lbs:,} lbs vs board max {policy.max_weight_lbs:,} lbs",
            overridable=False,
        )
    )
    expired = shipment.board_status != "open" or seconds_remaining <= 0
    guardrails.append(
        Guardrail(
            "open",
            not expired,
            "expired or no longer open" if expired else f"{seconds_remaining}s remaining",
            overridable=False,
        )
    )

    # 2. Capacity + our temporal lock model.
    origin_cap = hub_capacity(db, shipment.origin_hub_code, shipment.pickup_at, policy)
    dest_cap = hub_capacity(db, shipment.destination_hub_code, shipment.delivery_at, policy)
    predicted = predicted_board_unit(db, shipment)
    candidates: list[tuple[FleetUnit, LockPlan]] = []
    for unit in hub_units(db, shipment.origin_hub_code):
        if unit.board_status in ("maintenance", "off_duty"):
            continue
        candidates.append((unit, plan_lock(db, unit, shipment, policy, now, include_soft=policy.count_pending_bids_against_capacity)))
    feasible = [(u, p) for u, p in candidates if p.feasible and board_free(u, shipment.pickup_at)]
    feasible.sort(key=lambda up: up[1].deadhead_miles)
    best = feasible[0] if feasible else None

    predicted_plan: LockPlan | None = None
    if predicted is not None:
        predicted_plan = next((p for u, p in candidates if u.id == predicted.id), None)

    guardrails.append(
        Guardrail(
            "capacity",
            predicted is not None,
            f"{origin_cap.board_free} of {origin_cap.total} units at {shipment.origin_hub_code} bookable for this window"
            if predicted is not None
            else f"no free unit at {shipment.origin_hub_code} for pickup window",
        )
    )
    if predicted_plan is not None:
        guardrails.append(Guardrail("schedule", predicted_plan.feasible, f"unit {predicted.unit_number}: {predicted_plan.reason}"))
    else:
        guardrails.append(Guardrail("schedule", False, "no unit to schedule"))

    # The unit the board will give us determines real deadhead; fall back to hub pin.
    if predicted_plan is not None:
        deadhead_miles = predicted_plan.deadhead_miles
    else:
        hub = db.get(Terminal, shipment.origin_hub_code)
        deadhead_miles = haversine_miles(hub.latitude, hub.longitude, shipment.origin_latitude, shipment.origin_longitude) if hub else shipment.board_deadhead_miles
    deadhead_cost = round(deadhead_miles * shipment.cost_per_mile, 2)
    loaded_cost = float(shipment.estimated_cost)
    total_cost = round(loaded_cost + deadhead_cost, 2)

    guardrails.append(
        Guardrail(
            "deadhead",
            deadhead_miles <= policy.max_deadhead_miles,
            f"{deadhead_miles:.0f} empty miles (${deadhead_cost:,.0f}) vs max {policy.max_deadhead_miles:.0f}",
        )
    )

    # Reserve: booking must not leave the hub below the reserve floor (unless the hub is already below it
    # and this load is the only thing that would move a truck — then it is a judgment call, so it stays overridable).
    after = origin_cap.projected_free - 1
    guardrails.append(
        Guardrail(
            "reserve",
            after >= policy.reserve_units_per_terminal or origin_cap.total <= policy.reserve_units_per_terminal,
            f"{origin_cap.projected_free} free at {shipment.origin_hub_code} now, {max(after, 0)} after booking (reserve {policy.reserve_units_per_terminal})",
        )
    )

    # 3. Economics.
    market = pricing.market_reference(shipment.origin_hub_code, shipment.destination_hub_code, shipment.distance_miles) if pricing else {}
    pricing_out: dict | None = None
    if shipment.order_type == "fixed_rate":
        payout = float(shipment.offered_rate or 0.0)
        if market.get("market_rate"):
            market["offer_vs_market_pct"] = round(payout / market["market_rate"] - 1.0, 3)
    else:
        season = season_of(shipment.pickup_at.month)
        if pricing is not None:
            pricing_out = pricing.suggest_bid(
                origin_code=shipment.origin_hub_code,
                destination_code=shipment.destination_hub_code,
                miles=shipment.distance_miles,
                weight_lbs=shipment.weight_lbs,
                season=season,
                total_cost=total_cost,
                min_margin_usd=policy.min_margin_usd,
                min_margin_pct=policy.min_margin_pct,
                target_margin_pct=policy.target_bid_margin_pct,
            )
            payout = pricing_out["suggested_bid"]
        else:
            payout = round(total_cost * (1 + policy.target_bid_margin_pct), 2)

    margin = round(payout - total_cost, 2)
    margin_pct = round(margin / payout, 4) if payout else None
    lock_hours = predicted_plan.lock_hours if predicted_plan else (shipment.delivery_at - shipment.pickup_at).total_seconds() / 3600.0 + policy.turnaround_buffer_minutes / 60.0
    margin_per_hour = round(margin / lock_hours, 2) if lock_hours else None

    guardrails.append(
        Guardrail(
            "margin",
            margin >= policy.min_margin_usd and (margin_pct or 0) >= policy.min_margin_pct,
            f"${margin:,.0f} ({(margin_pct or 0) * 100:.1f}%) vs min ${policy.min_margin_usd:,.0f} / {policy.min_margin_pct * 100:.0f}%",
        )
    )

    # 4. Network / chaining term.
    network_mean = index.network_outbound_value()
    dest_value = index.hub_outbound_value(shipment.destination_hub_code)
    origin_value = index.hub_outbound_value(shipment.origin_hub_code)
    dest_scarcity = 1.0 - (dest_cap.projected_free / dest_cap.usable if dest_cap.usable else 0.0)
    origin_scarcity_after = 1.0 - (max(after, 0) / origin_cap.usable if origin_cap.usable else 0.0)
    chain_value = round(policy.chain_weight * dest_value * dest_scarcity, 2)
    drain_penalty = round(policy.chain_weight * origin_value * origin_scarcity_after * (1.0 if after < policy.reserve_units_per_terminal + 1 else 0.35), 2)
    score = round(margin + chain_value - drain_penalty, 2)

    # 5. Recommendation + human-readable reasons.
    failed = {g.name for g in guardrails if not g.passed}
    economics_bad = bool(failed & {"margin", "deadhead"})
    physically_blocked = bool(failed & {"capacity", "schedule", "reserve"})
    if overweight:
        rec = "decline" if shipment.order_type == "fixed_rate" else "skip"
        reasons.append(f"Overweight: {shipment.weight_lbs:,} lbs exceeds the {policy.max_weight_lbs:,} lb board max; the board will reject it.")
    elif expired:
        rec = "skip"
        reasons.append("No longer open on the board.")
    elif economics_bad:
        rec = "decline" if shipment.order_type == "fixed_rate" else "skip"
        if "margin" in failed:
            reasons.append(f"Margin ${margin:,.0f} ({(margin_pct or 0) * 100:.1f}%) is below policy (${policy.min_margin_usd:,.0f} / {policy.min_margin_pct * 100:.0f}%).")
        if "deadhead" in failed:
            reasons.append(f"{deadhead_miles:.0f} empty miles to the pickup is above the {policy.max_deadhead_miles:.0f} mile cap.")
    elif physically_blocked:
        rec = "hold"
        if "capacity" in failed:
            reasons.append(f"No bookable unit at {shipment.origin_hub_code} for this pickup window.")
        if "schedule" in failed and predicted_plan is not None:
            reasons.append(f"Unit {predicted.unit_number} the board would assign is not actually free: {predicted_plan.reason}.")
        if "reserve" in failed:
            reasons.append(f"Booking would leave {shipment.origin_hub_code} below its reserve of {policy.reserve_units_per_terminal} unit(s).")
    else:
        rec = "accept" if shipment.order_type == "fixed_rate" else "bid"
        reasons.append(f"Margin ${margin:,.0f} ({(margin_pct or 0) * 100:.1f}%) after ${deadhead_cost:,.0f} deadhead ({deadhead_miles:.0f} mi).")
        if margin_per_hour:
            reasons.append(f"${margin_per_hour:,.0f}/locked-hour over {lock_hours:.0f}h.")

    if market.get("offer_vs_market_pct") is not None:
        pct = market["offer_vs_market_pct"] * 100
        reasons.append(f"Offer is {pct:+.0f}% vs {shipment.lane_id} market reference (${market['market_rpm']:.2f}/mi, {market['basis']}, n={market['sample_size']}).")
    if pricing_out:
        reasons.append(
            f"Suggested bid ${pricing_out['suggested_bid']:,.0f}: P(win) {pricing_out['win_probability'] * 100:.0f}%, "
            f"expected profit ${pricing_out['expected_profit']:,.0f}; floor ${pricing_out['floor_bid']:,.0f}."
        )
    if chain_value >= 25:
        if dest_scarcity >= 0.5:
            reasons.append(f"Chaining bonus ${chain_value:,.0f}: {shipment.destination_hub_code} is short on trucks ({dest_cap.projected_free}/{dest_cap.usable} free) and its outbound loads average ${dest_value:,.0f} margin (network ${network_mean:,.0f}).")
        else:
            reasons.append(f"Chaining bonus ${chain_value:,.0f}: delivers a truck into {shipment.destination_hub_code} ({dest_cap.projected_free}/{dest_cap.usable} free), where outbound loads average ${dest_value:,.0f} margin.")
    if drain_penalty >= 25:
        if after <= policy.reserve_units_per_terminal + 1:
            reasons.append(f"Drain penalty ${drain_penalty:,.0f}: leaves {shipment.origin_hub_code} thin ({max(after, 0)} free after booking).")
        else:
            reasons.append(f"Drain penalty ${drain_penalty:,.0f}: pulls a truck out of {shipment.origin_hub_code}, where outbound loads average ${origin_value:,.0f} margin.")
    if predicted_plan is not None and predicted_plan.positioned_by:
        reasons.append(f"Unit {predicted.unit_number} chains off {predicted_plan.positioned_by} (deadhead measured from that drop).")
    if best is not None and predicted is not None and best[0].id != predicted.id:
        reasons.append(f"Our pick would be {best[0].unit_number} ({best[1].deadhead_miles:.0f} mi empty) but the board binds {predicted.unit_number} ({deadhead_miles:.0f} mi).")

    return Evaluation(
        external_id=shipment.external_id,
        order_type=shipment.order_type,
        recommendation=rec,
        guardrails=guardrails,
        reasons=reasons,
        payout=payout,
        loaded_cost=loaded_cost,
        deadhead_miles=deadhead_miles,
        deadhead_cost=deadhead_cost,
        total_cost=total_cost,
        margin=margin,
        margin_pct=margin_pct,
        margin_per_hour=margin_per_hour,
        lock_hours=lock_hours,
        chain_value=chain_value,
        drain_penalty=drain_penalty,
        score=score,
        predicted_unit=predicted_plan.to_dict() if predicted_plan else None,
        best_unit=best[1].to_dict() if best else None,
        candidates=[p.to_dict() for _, p in sorted(candidates, key=lambda up: (not up[1].feasible, up[1].deadhead_miles))[:8]],
        origin_capacity=origin_cap,
        destination_capacity=dest_cap,
        market=market,
        pricing=pricing_out,
        board_deadhead_miles=shipment.board_deadhead_miles,
        seconds_remaining=seconds_remaining,
        evaluated_at=now,
    )


def cache_evaluation(shipment: Shipment, ev: Evaluation) -> None:
    shipment.eval_recommendation = ev.recommendation
    shipment.eval_margin = ev.margin
    shipment.eval_score = ev.score
    shipment.eval_json = ev.to_dict()
    shipment.evaluated_at = ev.evaluated_at

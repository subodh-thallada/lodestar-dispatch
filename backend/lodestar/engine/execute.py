"""Book a load: guardrails -> board call -> locks -> decision ledger -> broadcast."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from lodestar.board.client import BoardClient, BoardError
from lodestar.clock import clock
from lodestar.engine.dispatcher import Evaluation, cache_evaluation, evaluate, predicted_board_unit
from lodestar.engine.locks import create_lock, plan_lock
from lodestar.engine.policy import Policy, load_policy
from lodestar.ingest.sync import apply_transition, record_event, upsert_order
from lodestar.models import Decision, Shipment
from lodestar.realtime import hub
from lodestar.state import state

log = logging.getLogger("lodestar.execute")

VALID_ACTIONS = {"accept", "decline", "bid"}


class ActionError(Exception):
    def __init__(self, status_code: int, detail: str, payload: dict | None = None):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.payload = payload or {}


@dataclass
class ExecResult:
    ok: bool
    outcome: str  # ok | blocked | rejected | error
    status_code: int
    message: str
    shipment: Shipment
    evaluation: Evaluation
    decision_id: int | None
    lock_events: list[str]

    def to_dict(self, serialize_shipment) -> dict:
        return {
            "ok": self.ok,
            "outcome": self.outcome,
            "status_code": self.status_code,
            "message": self.message,
            "decision_id": self.decision_id,
            "lock_events": self.lock_events,
            "shipment": serialize_shipment(self.shipment),
            "evaluation": self.evaluation.to_dict(),
        }


def _record(db: Session, shipment: Shipment, ev: Evaluation, *, actor: str, action: str, outcome: str, bid_rate: float | None, override: bool, status_code: int | None, message: str, now: datetime) -> Decision:
    d = Decision(
        shipment_id=shipment.id,
        external_id=shipment.external_id,
        actor=actor,
        action=action,
        outcome=outcome,
        bid_rate=bid_rate,
        expected_margin=ev.margin,
        deadhead_miles=ev.deadhead_miles,
        score=ev.score,
        override=override,
        guardrails=[g.to_dict() for g in ev.guardrails],
        reasons=ev.reasons,
        board_status_code=status_code,
        message=message,
        created_at=datetime.utcnow(),
        sim_time=now,
    )
    db.add(d)
    return d


async def execute(
    db: Session,
    board: BoardClient,
    shipment: Shipment,
    action: str,
    actor: str,
    *,
    bid_rate: float | None = None,
    override: bool = False,
    note: str | None = None,
    policy: Policy | None = None,
) -> ExecResult:
    if action not in VALID_ACTIONS:
        raise ActionError(400, f"unknown action '{action}'")
    if action == "accept" and shipment.order_type != "fixed_rate":
        raise ActionError(400, "accept is only valid for fixed_rate loads; submit a bid instead")
    if action == "bid" and shipment.order_type != "open_bid":
        raise ActionError(400, "bid is only valid for open_bid loads; accept or decline instead")

    now = clock.now()
    policy = policy or load_policy(db)
    ev = evaluate(db, shipment, policy, state.index, state.pricing, now)

    if action == "bid":
        if bid_rate is None:
            bid_rate = ev.pricing["suggested_bid"] if ev.pricing else ev.payout
        bid_rate = round(float(bid_rate), 2)
        if bid_rate <= 0:
            raise ActionError(400, "bid_rate must be positive")
        # Re-state economics for the bid actually being submitted.
        ev.payout = bid_rate
        ev.margin = round(bid_rate - ev.total_cost, 2)
        ev.margin_pct = round(ev.margin / bid_rate, 4)
        ev.score = round(ev.margin + ev.chain_value - ev.drain_penalty, 2)
        for g in ev.guardrails:
            if g.name == "margin":
                g.passed = ev.margin >= policy.min_margin_usd and ev.margin_pct >= policy.min_margin_pct
                g.detail = f"bid ${bid_rate:,.0f}: margin ${ev.margin:,.0f} ({ev.margin_pct * 100:.1f}%) vs min ${policy.min_margin_usd:,.0f} / {policy.min_margin_pct * 100:.0f}%"

    if action in {"accept", "bid"}:
        failed = ev.hard_failures
        blocking = [g for g in failed if not g.overridable] if override else failed
        if blocking:
            msg = "; ".join(f"{g.name}: {g.detail}" for g in blocking)
            d = _record(db, shipment, ev, actor=actor, action=action, outcome="blocked", bid_rate=bid_rate, override=override, status_code=None, message=msg, now=now)
            cache_evaluation(shipment, ev)
            db.commit()
            await hub.broadcast("decision.created", _decision_dict(d))
            return ExecResult(False, "blocked", 422, f"Blocked by guardrails — {msg}", shipment, ev, d.id, [])

    # --- board call --------------------------------------------------------------------
    try:
        if action == "accept":
            resp = await board.accept(shipment.external_id, note)
        elif action == "decline":
            resp = await board.decline(shipment.external_id, note)
        else:
            resp = await board.bid(shipment.external_id, bid_rate, note)
    except BoardError as exc:
        d = _record(db, shipment, ev, actor=actor, action=action, outcome="rejected", bid_rate=bid_rate, override=override, status_code=exc.status_code, message=exc.detail, now=now)
        record_event(db, "exec", f"board.rejected.{exc.status_code}", shipment.external_id, exc.detail)
        # Learn what the board thinks now (expired? taken?) so the UI converges immediately.
        try:
            fresh = await board.order(shipment.external_id)
            _, old, new = upsert_order(db, fresh, now, source="exec")
            apply_transition(db, shipment, old, new, policy, now)
        except BoardError:
            pass
        cache_evaluation(shipment, evaluate(db, shipment, policy, state.index, state.pricing, now))
        db.commit()
        await hub.broadcast("decision.created", _decision_dict(d))
        await hub.broadcast("shipment.updated", {"external_id": shipment.external_id})
        return ExecResult(False, "rejected", exc.status_code, f"Board rejected {action}: {exc.detail}", shipment, ev, d.id, [])

    # --- success: mirror board state, place locks, record ---------------------------------
    order = resp.get("order", resp)
    _, old, new = upsert_order(db, order, now, source="exec")
    shipment.booked_by = actor
    lock_events: list[str] = []
    if action == "bid":
        shipment.our_bid_rate = bid_rate
        shipment.payout = None
        shipment.booked_at = now
        if policy.count_pending_bids_against_capacity:
            unit = predicted_board_unit(db, shipment)
            if unit is not None:
                plan = plan_lock(db, unit, shipment, policy, now)
                create_lock(db, plan, shipment, "soft", now)
                lock_events.append(f"soft_lock:{unit.unit_number}")
    elif action == "accept":
        shipment.payout = shipment.offered_rate
        shipment.booked_at = now
    lock_events += apply_transition(db, shipment, old, new, policy, now)
    shipment.autopilot_handled = True
    cache_evaluation(shipment, ev)
    d = _record(db, shipment, ev, actor=actor, action=action, outcome="ok", bid_rate=bid_rate, override=override, status_code=200, message=resp.get("message", "ok"), now=now)
    db.commit()
    db.refresh(shipment)
    await hub.broadcast("decision.created", _decision_dict(d))
    await hub.broadcast("shipment.updated", {"external_id": shipment.external_id})
    await hub.broadcast("fleet.changed", {"reason": action})
    return ExecResult(True, "ok", 200, resp.get("message", "ok"), shipment, ev, d.id, lock_events)


def _decision_dict(d: Decision) -> dict:
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
        "created_at": d.created_at.isoformat() + "Z",
        "sim_time": d.sim_time.isoformat() + "Z",
    }

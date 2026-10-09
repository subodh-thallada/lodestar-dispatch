"""Auto-pilot: books loads without a click, but only through the same guardrails a
dispatcher is held to. Every action (and every deliberate non-action) lands in the
decision ledger with its reasons.

Modes: off (dormant) · advise (recommendations only) · execute (books and bids).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from sqlalchemy import select

from lodestar.board.client import BoardClient
from lodestar.clock import clock
from lodestar.config import settings
from lodestar.db import SessionLocal
from lodestar.engine.dispatcher import cache_evaluation, evaluate
from lodestar.engine.execute import ActionError, execute
from lodestar.engine.policy import load_policy
from lodestar.models import Decision, Shipment
from lodestar.realtime import hub
from lodestar.state import state

log = logging.getLogger("lodestar.autopilot")


async def autopilot_tick(board: BoardClient) -> dict:
    """One pass over the open board. Returns a summary of what was done."""
    summary = {"evaluated": 0, "accepted": 0, "bid": 0, "declined": 0, "skipped": 0, "held": 0, "blocked": 0, "rejected": 0}
    now = clock.now()
    with SessionLocal() as db:
        policy = load_policy(db)
        if policy.autopilot_mode != "execute":
            return summary
        open_loads = list(
            db.scalars(
                select(Shipment)
                .where(Shipment.board_status == "open", Shipment.autopilot_handled.is_(False), Shipment.expires_at > now)
                .order_by(Shipment.expires_at)
            )
        )
        # Rank by score so scarce capacity goes to the best load first; re-evaluate each
        # one just before acting because every booking changes the capacity picture.
        ranked = []
        for ship in open_loads:
            ev = evaluate(db, ship, policy, state.index, state.pricing, now)
            cache_evaluation(ship, ev)
            ranked.append((ev.score if ev.score is not None else -1e9, ship))
        db.commit()
        ranked.sort(key=lambda t: -t[0])

        for _, ship in ranked:
            summary["evaluated"] += 1
            if (ship.expires_at - clock.now()).total_seconds() < settings.min_seconds_remaining:
                continue
            ev = evaluate(db, ship, policy, state.index, state.pricing, clock.now())
            rec = ev.recommendation
            try:
                if rec == "accept":
                    res = await execute(db, board, ship, "accept", "autopilot", policy=policy)
                    summary["accepted" if res.ok else res.outcome] += 1
                elif rec == "bid":
                    res = await execute(db, board, ship, "bid", "autopilot", bid_rate=ev.pricing["suggested_bid"] if ev.pricing else None, policy=policy)
                    summary["bid" if res.ok else res.outcome] += 1
                elif rec == "decline" and policy.autopilot_auto_decline and _clear_loser(ev, policy):
                    res = await execute(db, board, ship, "decline", "autopilot", policy=policy, note="autopilot: " + (ev.reasons[0] if ev.reasons else "below policy"))
                    summary["declined" if res.ok else res.outcome] += 1
                elif rec in ("decline", "skip"):
                    # Not worth booking, but not a clear loser either: leave it for a human, log why once.
                    _log_skip(db, ship, ev, now)
                    ship.autopilot_handled = True
                    db.commit()
                    summary["skipped"] += 1
                else:  # hold: capacity/schedule may free up before expiry, so look again next tick
                    summary["held"] += 1
            except ActionError as exc:
                log.warning("autopilot %s on %s refused: %s", rec, ship.external_id, exc.detail)
            except Exception:
                log.exception("autopilot action failed for %s", ship.external_id)
    state.autopilot_runs += 1
    state.autopilot_last_run = datetime.utcnow()
    acted = summary["accepted"] + summary["bid"] + summary["declined"]
    state.autopilot_actions += acted
    if acted or summary["skipped"]:
        await hub.broadcast("autopilot.tick", summary)
    return summary


def _clear_loser(ev, policy) -> bool:
    overweight = any(g.name == "weight" and not g.passed for g in ev.guardrails)
    return overweight or (ev.margin is not None and ev.margin <= 0)


def _log_skip(db, ship: Shipment, ev, now: datetime) -> None:
    db.add(
        Decision(
            shipment_id=ship.id,
            external_id=ship.external_id,
            actor="autopilot",
            action="skip",
            outcome="ok",
            bid_rate=None,
            expected_margin=ev.margin,
            deadhead_miles=ev.deadhead_miles,
            score=ev.score,
            override=False,
            guardrails=[g.to_dict() for g in ev.guardrails],
            reasons=ev.reasons,
            board_status_code=None,
            message="left for dispatcher: " + (ev.reasons[0] if ev.reasons else "below policy"),
            created_at=datetime.utcnow(),
            sim_time=now,
        )
    )


async def autopilot_loop(board: BoardClient, stop: asyncio.Event, ready: asyncio.Event) -> None:
    await ready.wait()
    while not stop.is_set():
        try:
            await autopilot_tick(board)
        except Exception:
            log.exception("autopilot tick failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=settings.autopilot_interval_seconds)
        except asyncio.TimeoutError:
            pass

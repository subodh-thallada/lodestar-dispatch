# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Freight dispatchers at a regional truckload carrier, working a desk with two or three
screens during an eight to ten hour shift, usually with a phone in the other hand. Their
job: watch a customer load board, decide within a ten-minute expiry window whether to
accept a fixed-rate load or what to bid on an open-bid load, and keep every truck at every
hub earning without double-booking it. Secondary audience: operations leads and the
challenge judges who evaluate the product from a demo and the repository. *(Inferred from
the challenge brief; the user asked to proceed without an interview.)*

## Product Purpose

Lodestar Dispatch is the dispatch brain between a customer load board and a carrier's
fleet. It ingests the board in real time, prices every load honestly (loaded cost plus
the empty move from the unit that will actually be bound), enforces margin, deadhead,
capacity and schedule guardrails before a booking reaches the board, prices open bids
from history, and can run the desk on auto-pilot with every decision explained. Success
is profitable utilization: booked margin after cost, low empty miles, healthy fleet use,
and no stranded trucks — not win rate or volume.

## Positioning

Capacity is a schedule, not a count. Lodestar keeps a temporal lock per unit that includes
the deadhead travel and projects where the truck *will be* after its current drop, so it
can pre-chain loads and refuse bookings the board itself would wrongly allow. Every
recommendation carries its reasons, and auto-pilot is held to the same guardrails as a
human, which is what makes it deployable.

## Operating Context

- Two services: the provided simulated load board (FastAPI, `board/`, unmodified) and
  Lodestar (FastAPI backend + this React console). The console talks only to Lodestar's
  `/api`; Lodestar talks to the board.
- The board runs an accelerated simulation clock; all pickups, deliveries, expiries and
  locks are in *sim time*. Open loads live for 10 sim minutes. Speed changes reset the
  board's sim epoch.
- Demo scene: a judge watches a dispatcher (or auto-pilot) work the board for about six
  minutes on a laptop or projector; then reads the repo.
- Local run: board on :8000, Lodestar on :8100 serving the built console; dev console on
  :5173 via Vite proxy. Deployment target: Railway (long-lived processes, WebSockets).

## Capabilities and Constraints

- Live queues split fixed-rate (Book-It-Now) vs open-bid, with expiry countdowns ticking
  on the client's copy of the sim clock.
- Per load: offer or suggested bid, loaded cost, deadhead miles and cost from the unit the
  board will bind, total cost, margin $/%, margin per locked hour, guardrail results,
  reasons, chaining bonus, market comparison, candidate units.
- Actions: accept, decline, bid (with override of overridable guardrails and a note).
  Overweight and expired loads are never overridable. Board rejections (409) surface with
  the board's own detail.
- Fleet: terminal utilization, per-unit phase (idle, committed, deadheading, in transit,
  turnaround, bid pending, maintenance), interpolated positions, per-unit lock Gantt,
  capacity forecast at +0/2/6/12/24h with warnings.
- Auto-pilot: off / advise / execute, live-tunable policy, decision ledger with reasons.
- Analytics: KPIs, historical lane table, hub outbound value, pricing-model metrics.
- All data is pushed over one WebSocket with a polling fallback; the UI must stay honest
  when the board or Lodestar is unreachable.
- Terminology: load/shipment, unit (driver + truck), hub/terminal, lane (ORIG-DEST),
  deadhead (empty miles), lock, soft lock (bid exposure), reserve, BIN (Book-It-Now).
- Undecided: authentication (none in the challenge build), multi-dispatcher concurrency.

## Brand Commitments

- Name: Lodestar (Lodestar Dispatch). No logo asset exists; a mark may be drawn.
- The user explicitly rejected the incumbent look (dark slate with cyan/violet accents)
  and asked for a different colour world; "not AI slop".
- Inspiration the user named, "with a grain of salt" since they are landing pages:
  impeccable.style, maritime.sh, agent37.com, simulithic.com, supermemory.ai.

## Evidence on Hand

- Real live data from the board and Lodestar's own tables (no fabricated numbers needed).
- 2,500-row historical dataset at `board/data/historical_shipments.csv`.
- Screenshots in `docs/screenshots/` (to be replaced after the redesign).
- No customer logos, testimonials or pricing exist; none may be invented.

## Product Principles

1. The number a dispatcher needs is already on the card; nothing requires a second click
   to learn whether a load is worth it.
2. Expiry pressure is visible but never panicky; the UI tells you how long you have, not
   that you are late.
3. Every automated decision is explainable in the same vocabulary a human would use.
4. The board's state is the truth for bookings; Lodestar's state is the truth for
   schedule and economics, and the UI never hides a disagreement between them.
5. Familiar operational affordances win over novelty; expression lives in precise details.

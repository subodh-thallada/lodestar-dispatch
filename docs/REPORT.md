# Lodestar — Engineering & Business Report

*Intelligent Freight Load Board & Autonomous Dispatch Engine — SFI International Fall Mini-Challenge*

## 1. The problem, as we read it

A regional carrier's dispatcher is making a capital-allocation decision every few
minutes under a ten-minute clock: *this* truck, at *this* hub, for the next one to three
days, against *this* payout. Three things make the decision hard, and none of them is
"find a truck":

1. **The cost of a load is not on the load.** The posted `estimated_cost` covers loaded
   miles only. The empty move to the pickup depends on which unit goes, and where that
   unit *will be* — not where it is now. A unit still delivering 300 miles away is a
   different cost than one idling at the hub.
2. **Capacity is a schedule, not a count.** "Seven units available at ATL" says nothing
   about whether one of them can be at a pickup 90 miles away at 06:00 tomorrow and back
   before the Friday load it is already committed to. Double-booking is a time-window
   problem.
3. **Every booking moves the network.** Capacity follows the freight: the truck that
   takes ATL→CHI becomes Chicago capacity. Booking a rich load out of a hub that is
   already thin can cost more in missed outbound loads than it earns.

The provided board enforces weight and a simple per-hub count. It does not enforce
margin, deadhead, projected position or reserve capacity — and its own availability rule
counts a unit as free at its *old* hub for a pickup after its current delivery, even
though it will physically be at the destination. That gap between "the board will let
you" and "this is good business" is where Lodestar lives.

## 2. What we built

Lodestar is a two-service product: a FastAPI dispatch backend with its own relational
schema (shipments, fleet units, temporal locks, decisions, inventory snapshots, policy)
and a React dispatcher console. The board is treated as an external customer portal:
Lodestar ingests it, decides, books through it, and mirrors its outcomes.

| Requirement | Where it is | How |
|---|---|---|
| §3A Relational DB & state | `backend/lodestar/models.py`, `docs/ARCHITECTURE.md` ERD | 9 tables; `unit_locks` is the temporal resource ledger; board unit ids are reused so the sandbox and our state never diverge |
| §3B Real-time ingestion | `ingest/worker.py` | Board WebSocket for new loads + 3 s reconciliation polling + 4 s fleet sync; survives socket loss and board restarts |
| §3C Time-window conflicts | `engine/locks.py` | Interval locks `[pickup − deadhead travel, delivery + buffer)`; feasibility = can reach pickup on time ∧ no overlap; projected position from prior locks |
| §3C Empty-mile reduction | `engine/dispatcher.py` | Deadhead measured from the unit the board will bind, from its projected drop; cap per policy; chaining term in the score |
| §3C Continuity / margin awareness | `engine/dispatcher.py` | `score = margin + chain_value − drain_penalty`; margin per locked hour; recommendation accept/bid/hold/decline |
| §3D Dispatcher UI | `frontend/src` | Live queues split BIN / open-bid with countdowns, one-click accept/decline with board feedback, bid entry with model suggestion and live P(win), terminal utilization, Gantt schedule, capacity warnings |
| §3E Backend guardrails | `engine/execute.py` | weight · open · capacity · schedule · deadhead · reserve · margin; overweight and expired are never overridable; every block is logged |
| §4A Analytics / ML | `engine/history.py`, `engine/pricing.py` | Lane market rates, hub outbound value, L2 logistic win-probability model (numpy), EV-optimal bid search |
| §4B Auto-pilot | `engine/autopilot.py` | off / advise / execute; best-score-first; same guardrails as humans; borderline loads left for people; every action and non-action explained in the ledger |

## 3. How the hard parts were implemented

### 3.1 Constraint logic and time-window scheduling

Each fleet unit owns a list of **locks**. A lock is created when the board confirms a
booking (hard) or when we submit a bid (soft, i.e. exposure), and released when the board
reports completion, loss or expiry. To decide whether unit *U* can take shipment *S*
Lodestar computes *U*'s state at `S.pickup_at`: the last lock ending before that instant
tells us where the truck will be (that load's drop) and when it is free; from there it
measures the empty miles to the pickup, converts them to travel time at the policy speed,
and derives `depart_at`. The booking is feasible only if the unit is free before
`depart_at` and the interval `[depart_at, delivery + turnaround)` overlaps nothing else.

This is stricter than the board on purpose. In `test_chained_load_uses_projected_position`
a unit on ATL→CHI is correctly offered a CHI outbound load with ~10 empty miles and
refused an ATL outbound load that would need a 600-mile empty move it cannot make in time.
The board would accept both.

Capacity per hub is then "usable units the board considers free that have no lock covering
the pickup window", minus a configurable **reserve**. The **forecast** walks every unit's
locks to show free units at +2/+6/+12/+24 h, counting a truck that is inbound on a
delivery as capacity at its *destination* — the console warns before a hub runs dry.

### 3.2 Empty-mile optimisation and chaining

Deadhead is always computed from the unit the board will actually bind (we mirror its
nearest-free rule) and from that unit's *projected* position. The policy caps empty miles
outright and the deadhead cost is in every margin figure. On the live board this moved
the honest margin number by an average of 28 empty miles (≈ $50) per load and, in the
`Near …` off-hub cases, by over 100 miles.

Chaining is handled in two places. Structurally: because a lock's position comes from the
previous drop, a dispatcher (or auto-pilot) can pre-book the outbound load for a truck that
is still inbound, which is exactly the ATL→CHI→CHI-outbound pattern the brief describes.
Economically: `chain_value` rewards delivering into a hub that is short on trucks and whose
outbound loads historically pay well; `drain_penalty` discourages emptying a hub that is
itself valuable. Both are explained on the card ("Chaining bonus $134: delivers a truck into
LAX (0/7 free), where outbound loads average $3,058 margin").

### 3.3 Using the historical data

* **Market reference per lane.** Median all-in $/mile per lane (fallback: origin-hub
  strength applied to a distance-band curve). Every fixed-rate card says how the offer
  compares to its lane ("+10% vs DEN-EWR market, n=14").
* **Hub outbound value.** Average realised margin of won loads leaving each hub — the
  chaining term. LAX ($3,058) and SEA outbound are rich; ATL ($598) is cheap backhaul,
  matching the dataset's directional pricing.
* **Win-probability model.** Logistic regression on `bid/market − 1`, log(miles),
  weight and season over 1,081 historical auctions. Held-out AUC 0.67, Brier 0.23, well
  calibrated across buckets; the bid-gap coefficient is strongly negative, as it should
  be. The suggested bid maximises `P(win) × (bid − total cost)` above a cost-plus floor.
* **Backtest** (`scripts/backtest.py`). On the held-out 25 % of auctions the model's
  bids yield an expected $714 per auction versus $616 for the historical bids (+16 %),
  with a similar win rate — it bids above the historical bid 45 % of the time and never
  below cost. On fixed-rate history the dataset is benign (one loss-making offer in
  1,419), so the policy filter changes little there; the point of that rail shows up on
  the live board, below.

### 3.4 Balancing volume and profitability

Policy is explicit and live-tunable: minimum margin in $ and %, max deadhead, reserve
units per hub, target bid margin, chaining weight, whether outstanding bids count against
capacity. Defaults are $150 / 10 % / 150 mi / 1 unit / 18 %. The recommendation is
categorical so a dispatcher can scan: green cards clear every rail, **hold** means the
economics are fine but a truck is not (look again before expiry), red means the load is
bad business at *any* capacity.

On ~120 evaluated fixed-rate loads from the live board, 3 % were loss-making after
deadhead and a further 11 % fell under the policy floor; the engine declines the first
group automatically in execute mode and leaves the second for a human. Auto-pilot ranks
by score, not by expiry, so when two good loads compete for the last unit at a hub the
richer-per-hour one wins and the other is logged as `skip` with the reason.

Open-bid awards on the sandbox are random (45 %), so bid *amount* is scored on margin
when won, exactly as the brief says: the default target is cost-plus 18 %, raised by the
model when the lane supports it.

## 4. Results on the live board

Numbers from one development session against the board at default settings (18 tests
and the 23-check `scripts/e2e_check.py` pass):

| Metric | Value |
|---|---|
| Loads ingested / evaluated | 265 / 100 % within one poll interval (≤ 3 s; WebSocket path < 100 ms) |
| Booked margin on 11 loads | $20.5 k, 35 % of revenue, empty-mile ratio 1.8 % |
| Guardrail blocks before reaching the board | 100 % of bad accepts/bids (0 board 409s in the e2e run) |
| Bid guardrail | lowball bids below the cost-plus floor rejected with the failing rail; overridable by a dispatcher, never by auto-pilot |
| Lifecycle fidelity | every booking's unit, payout and re-homed hub matched the board after delivery (80/80 units) |

## 5. Why this is worth adopting

For a carrier the value of a tool like this is not in any single accept; it is in
making every dispatcher behave like the best one on the desk, on the worst day:

* **Margin discipline without slowing anyone down.** Every card already carries the
  number a dispatcher would otherwise compute in their head, with the empty miles the
  board hides. Thin and negative loads are visibly red before the clock runs out.
* **Fewer stranded trucks.** Locks, reserves and the forecast turn "we have seven units"
  into "we have two we can actually promise", and the chaining term quietly steers freight
  toward hubs that need trucks.
* **An audit trail.** Every accept, bid, decline and skip — by human or auto-pilot — is in
  the ledger with its guardrails and reasons. That is what makes auto-pilot deployable:
  it can be turned on for the easy 70 % of loads with the same rules the humans use, and
  reviewed.
* **A pricing model that learns from the company's own history**, surfaced as a suggestion
  with a probability, not a black box.

## 6. Scaling to an enterprise

| Concern | Today | Enterprise |
|---|---|---|
| Storage | SQLite (WAL) | PostgreSQL; `unit_locks` gets a GiST exclusion constraint on `(unit_id, tstzrange(starts_at, ends_at))` so double-booking is impossible at the database level, not just in code |
| Services | one process: ingest + engine + auto-pilot + API | ingestion as a Kafka/Kinesis consumer per board, engine as stateless workers, auto-pilot as a leader-elected worker, API behind a load balancer; the push hub becomes Redis pub/sub |
| Concurrency | single asyncio loop | optimistic locking on shipments (`version` column) and `SELECT … FOR UPDATE` on candidate units during booking so two dispatchers cannot book the same truck |
| Multiple boards / customers | one board client | board adapters behind one interface; `external_id` namespaced by board |
| Optimisation | greedy best-score-first with projected positions | periodic global re-plan (ILP / column generation over unit–load assignments for the next 48 h) with the greedy engine handling the real-time edge; the evaluator is already pure and per-hub parallel |
| Pricing | logistic regression retrained at boot | gradient-boosted model retrained nightly on realised outcomes, with lane-level drift monitoring and a human-in-the-loop floor |
| Positions | interpolated from locks | ELD / telematics feed replaces interpolation; HOS rules become another guardrail |
| Operations | logs + decision ledger | metrics (ingest lag, blocked/rejected rates, margin vs policy) to Prometheus, alerts on board disconnects and 409 spikes; auth via SSO with per-role override rights |

## 7. Honest limitations

* The sandbox binds the unit; a production TMS would own assignment and the "best unit"
  we compute would be the one dispatched. The code already computes both and shows the
  difference on the card.
* Travel time is distance ÷ constant speed with a fixed turnaround; no HOS, no traffic.
* The win-probability model is trained on synthetic history and uses lane medians as the
  market reference, which limits it to ~0.67 AUC. Real tender data would be richer.
* Chaining is one-step look-ahead through the score; it is not a global plan.

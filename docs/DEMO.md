# Demo runbook (≈ 6 minutes)

A hosted copy runs at https://lodestar.salmonsand-d6496a70.canadacentral.azurecontainerapps.io
(same build, board posting every 20 s). Everything below also runs locally with two terminals. Speeds and buttons referenced are in
the console header.

## 0. Setup (once)

```bash
git clone --recurse-submodules <this repo>
cd lodestar-dispatch
python -m venv .venv && .venv/Scripts/activate        # macOS/Linux: source .venv/bin/activate
pip install -r board/requirements.txt -r backend/requirements.txt
cd frontend && npm install && npm run build && cd ..
```

## 1. Start the board and Lodestar

```bash
# terminal 1 — the provided load board (orders every 60 s by default; 10 s makes a livelier demo)
powershell -File scripts/run_board.ps1 -IntervalSeconds 10      # or: scripts/run_board.sh 8000 10

# terminal 2 — Lodestar (serves the built console on the same port)
powershell -File scripts/run_lodestar.ps1                       # or: scripts/run_lodestar.sh
```

Open <http://127.0.0.1:8100>. The header should show **board websocket · live · auto-pilot advise**.
(For frontend development use `npm run dev` in `frontend/` and open :5173 — it proxies `/api`.)

**Two board quirks to know before you drive it.** Open loads live for 10 *sim* minutes, so at
300× a load expires in two wall seconds — book at 1×, then speed up to watch deliveries.
And the board resets its sim epoch to "now" every time the speed changes, so in-flight
loads can appear to jump back in time afterwards; Lodestar re-syncs its clock within one poll.

## 2. The story, panel by panel

**Load board (1 min).** Press **+ demo loads** twice. Each card shows the full economics
*before* you click: offer or suggested bid, loaded cost, empty miles to the pickup from the
unit the board will actually bind, total cost, margin in $ and %, margin per locked hour,
and the guardrail chips. Read one card's reasons aloud — they are the engine's own
explanation. Accept a green card: the toast quotes the board's confirmation and the unit
it locked. Try to accept a red one: the backend refuses with the failing rail; tick
*override guardrails* to show the human stays in charge (overweight loads cannot be
overridden — the board would 409).

**Open bid (1 min).** On an open-bid card the input is prefilled with the model's
EV-optimal bid; drag it down below the floor and watch P(win) rise while margin and EV
fall; submit at the suggestion. Switch to the *Booked & pending* table: the bid shows
`bid submitted` with the decision countdown.

**Network (1 min).** Hubs are sized by free units and coloured by reserve status; booked
lanes are blue arcs with the unit dot moving along them; outstanding bids are dashed
purple. Click a hub for its roster. The *Capacity warnings* panel comes from the
lock-aware forecast — set speed to **300×**, book a few loads out of one hub, and watch it
warn before the hub is actually empty.

**Schedule (1 min).** The Gantt is the temporal-lock table drawn: amber = empty move,
blue = loaded, grey = turnaround buffer, dashed = soft lock from a bid. Hover a bar for
the numbers. Point out a unit with two bars: the second load was planned from where the
first one *drops*, not from where the truck is now.

**Auto-pilot (1.5 min).** Set mode to **execute** and speed to **300×**. The ledger fills
with `autopilot · accept · ok`, `autopilot · bid · ok`, and `autopilot · skip` entries
that each carry the same reasons a dispatcher would see; clear losers are declined,
borderline loads are left on the board for a human. Drag *Minimum margin* up and press
*Apply* — every open card re-grades instantly. Set mode back to **advise**.

**Analytics (30 s).** KPI strip: booked margin, empty-mile ratio, utilization, bid win
rate and exposure, *losses avoided* (negative-margin loads we declined), guardrail blocks
and board 409s (there should be none — rejections are caught before the board call).
Below: historical lane table, hub outbound value (the chaining term) and the pricing
model's held-out calibration.

## 3. Proof points to run live if asked

```bash
.venv/Scripts/python -m pytest backend/tests -q        # 18 tests: locks, evaluator, pricing, sync
.venv/Scripts/python scripts/e2e_check.py              # 23 checks against both running servers
.venv/Scripts/python scripts/backtest.py               # policy replay over the 2,500-row history
```

## 4. Reset

Stop both servers, delete `board/freight_challenge.db` and `backend/lodestar.db`, restart.

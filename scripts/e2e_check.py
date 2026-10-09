#!/usr/bin/env python3
"""End-to-end check: board + Lodestar running, exercise the whole dispatch loop.

Prerequisites (two terminals):
  board:    cd board && uvicorn app.main:app --port 8000
  lodestar: cd backend && uvicorn lodestar.main:app --port 8100

Then:
  python scripts/e2e_check.py [--board http://127.0.0.1:8000] [--lodestar http://127.0.0.1:8100]

Against a hosted copy where only Lodestar is exposed (the board runs inside the container):
  python scripts/e2e_check.py --lodestar https://<host> --no-board

What it proves, in order:
  1. Lodestar is ready, synced to the board clock, history loaded, model trained
  2. new loads on the board appear in Lodestar with an evaluation within a few seconds
  3. accepting a recommended fixed-rate load locks the unit the board bound
  4. a lowball bid is blocked by guardrails; the suggested bid goes through
  5. an overweight load is refused before the board is even called
  6. at 3600x the bid resolves, loads deliver, locks release, units re-home
  7. KPIs reconcile with the shipments table
"""

from __future__ import annotations

import argparse
import sys
import time

import httpx

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


class Check:
    def __init__(self) -> None:
        self.passed = 0
        self.failed = 0

    def ok(self, name: str, detail: str = "") -> None:
        self.passed += 1
        print(f"  PASS  {name}  {detail}")

    def fail(self, name: str, detail: str = "") -> None:
        self.failed += 1
        print(f"  FAIL  {name}  {detail}")

    def expect(self, cond: bool, name: str, detail: str = "") -> bool:
        (self.ok if cond else self.fail)(name, detail)
        return cond


def wait_for(fn, timeout=30.0, every=1.0):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        last = fn()
        if last:
            return last
        time.sleep(every)
    return last


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--board", default="http://127.0.0.1:8000")
    ap.add_argument("--lodestar", default="http://127.0.0.1:8100")
    ap.add_argument("--no-board", action="store_true", help="board not reachable directly (hosted demo): drive it through Lodestar's /api/sim proxies and skip board cross-checks")
    args = ap.parse_args()
    c = Check()
    l = httpx.Client(base_url=args.lodestar, timeout=60)
    b = None if args.no_board else httpx.Client(base_url=args.board, timeout=30)

    def spawn(count: int) -> dict:
        if b is None:
            return l.post("/api/sim/spawn", json={"count": count}).json()
        return b.post("/simulation/spawn-orders", json={"count": count}).json()

    print("\n--- 1. readiness ---")
    try:
        h = l.get("/api/health").json()
    except httpx.HTTPError as exc:
        print(f"Lodestar not reachable at {args.lodestar}: {exc}")
        return 2
    c.expect(h.get("ready") is True, "lodestar ready", f"history {h['ingest']['history_rows']} rows from {h['ingest']['history_source']}")
    c.expect(h["ingest"]["board_reachable"], "board reachable", f"mode={h['ingest']['mode']}")
    model = l.get("/api/analytics/model").json()
    c.expect(0.5 < model["auc"] < 1.0, "pricing model trained", f"AUC {model['auc']} on {model['test_rows']} held-out rows")
    l.put("/api/autopilot", json={"mode": "advise"})
    l.post("/api/sim/speed", json={"simulation_speed": 1})

    print("\n--- 2. ingestion ---")
    spawned = spawn(10)
    ids = set(spawned["external_ids"])

    def seen():
        got = {s["external_id"]: s for s in l.get("/api/shipments?status=open").json()["shipments"]}
        hit = ids & set(got)
        return got if len(hit) >= 8 else None

    got = wait_for(seen, timeout=20)
    c.expect(bool(got), "spawned loads ingested", f"{len(ids & set(got or {}))}/{len(ids)} within 20s")
    evaluated = [s for s in (got or {}).values() if s["external_id"] in ids and s["evaluation"]]
    c.expect(len(evaluated) >= 8, "loads evaluated", f"{len(evaluated)} carry margin/deadhead/recommendation")

    print("\n--- 3. accept a recommended fixed-rate load ---")
    opens = l.get("/api/shipments?status=open").json()["shipments"]
    acc = next((s for s in opens if s["order_type"] == "fixed_rate" and s["recommendation"] == "accept"), None)
    if acc is None:
        spawn(12)
        time.sleep(4)
        opens = l.get("/api/shipments?status=open").json()["shipments"]
        acc = next((s for s in opens if s["order_type"] == "fixed_rate" and s["recommendation"] == "accept"), None)
    if c.expect(acc is not None, "found an accept-recommended load"):
        r = l.post(f"/api/shipments/{acc['external_id']}/accept", json={})
        ok = r.status_code == 200
        c.expect(ok, "accept succeeded", r.json().get("message", "")[:80] if ok else r.text[:160])
        if ok:
            ship = r.json()["shipment"]
            c.expect(ship["status"] == "accepted" and ship["assigned_unit_number"], "unit bound", f"{ship['assigned_unit_number']} margin {ship['booked_margin']}")
            if b is not None:
                board_order = b.get(f"/orders/{acc['external_id']}").json()
                c.expect(board_order["assigned_driver_id"] == ship["assigned_unit_id"], "lock mirrors board assignment", f"unit id {ship['assigned_unit_id']}")
            sched = l.get("/api/schedule").json()
            locks = [lk for u in sched["units"] for lk in u["locks"] if lk["external_id"] == acc["external_id"]]
            c.expect(len(locks) == 1 and locks[0]["kind"] == "hard", "hard lock on schedule", f"{locks[0]['starts_at']} -> {locks[0]['ends_at']}" if locks else "")
        r2 = l.post(f"/api/shipments/{acc['external_id']}/accept", json={})
        c.expect(r2.status_code in (409, 422), "re-accept refused", f"HTTP {r2.status_code}")

    print("\n--- 4. open-bid guardrails ---")
    opens = l.get("/api/shipments?status=open").json()["shipments"]
    bid = next((s for s in opens if s["order_type"] == "open_bid" and s["recommendation"] == "bid"), None)
    if c.expect(bid is not None, "found a bid-recommended load"):
        ev = bid["evaluation"]
        low = l.post(f"/api/shipments/{bid['external_id']}/bid", json={"bid_rate": round(ev["total_cost"] * 0.9, 2)})
        c.expect(low.status_code == 422, "lowball bid blocked by margin guardrail", f"HTTP {low.status_code}")
        good = l.post(f"/api/shipments/{bid['external_id']}/bid", json={"bid_rate": ev["pricing"]["suggested_bid"]})
        c.expect(good.status_code == 200, "suggested bid submitted", good.json().get("message", "")[:70] if good.status_code == 200 else good.text[:120])
        if good.status_code == 200:
            c.expect("soft_lock" in ",".join(good.json()["lock_events"]), "soft lock placed for bid exposure", ",".join(good.json()["lock_events"]))

    print("\n--- 5. overweight refused locally ---")
    opens = l.get("/api/shipments?status=all&limit=2000").json()["shipments"]
    over = next((s for s in opens if s["status"] == "open" and s["weight_lbs"] > 44000), None)
    if over is None:
        for _ in range(4):
            spawn(15)
            time.sleep(3)
            opens = l.get("/api/shipments?status=open").json()["shipments"]
            over = next((s for s in opens if s["weight_lbs"] > 44000), None)
            if over:
                break
    if over is not None:
        action = "accept" if over["order_type"] == "fixed_rate" else "bid"
        r = l.post(f"/api/shipments/{over['external_id']}/{action}", json={"override": True, "bid_rate": 5000})
        c.expect(r.status_code == 422, "overweight blocked even with override", f"{over['weight_lbs']} lbs -> HTTP {r.status_code}")
        c.expect(over["recommendation"] in ("decline", "skip"), "overweight recommendation is decline/pass", over["recommendation"])
    else:
        print("  SKIP  no overweight load appeared (board emits ~8%)")

    print("\n--- 6. lifecycle at 3600x ---")
    l.post("/api/sim/speed", json={"simulation_speed": 3600})
    booked_ids = [s["external_id"] for s in l.get("/api/shipments?status=active").json()["shipments"]]

    def resolved():
        rows = {s["external_id"]: s for s in l.get("/api/shipments?status=all&limit=2000").json()["shipments"]}
        mine = [rows[i] for i in booked_ids if i in rows]
        done = [s for s in mine if s["status"] in ("completed", "bid_lost")]
        return mine if mine and len(done) == len(mine) else None

    mine = wait_for(resolved, timeout=240, every=2)  # a 2,400-mile load needs ~60 sim hours
    l.post("/api/sim/speed", json={"simulation_speed": 1})
    c.expect(bool(mine), "all booked loads reached completed/bid_lost", ", ".join(f"{s['external_id']}={s['status']}" for s in (mine or [])))
    sched = l.get("/api/schedule?hours_back=72").json()
    live = [lk for u in sched["units"] for lk in u["locks"] if lk["external_id"] in booked_ids and lk["status"] == "active"]
    c.expect(not live, "locks released after delivery", f"{len(live)} still active")
    if b is not None:
        units = {u["unit_number"]: u for u in l.get("/api/fleet/units").json()["units"]}
        board_units = {u["unit_number"]: u for u in b.get("/fleet/units").json()}
        terms = {t["id"]: t["code"] for t in b.get("/terminals").json()}
        mismatch = [n for n, u in units.items() if terms[board_units[n]["home_terminal_id"]] != u["home_terminal_code"]]
        c.expect(not mismatch, "unit home hubs match the board after re-homing", f"{len(units)} units checked")
    else:
        rehomed = [u for u in l.get("/api/fleet/units").json()["units"] if not u["unit_number"].startswith(u["home_terminal_code"])]
        c.expect(len(rehomed) >= 1, "capacity moved with the freight (units re-homed)", f"{len(rehomed)} units now homed away from their seed hub")

    print("\n--- 7. KPIs reconcile ---")
    k = l.get("/api/kpis").json()
    booked = [s for s in l.get("/api/shipments?status=all&limit=2000").json()["shipments"] if s["status"] in ("accepted", "in_transit", "completed") and s["payout"]]
    c.expect(k["booked_loads"] == len(booked), "booked_loads matches shipments", f"{k['booked_loads']}")
    c.expect(abs(k["booked_revenue"] - sum(s["payout"] for s in booked)) < 1, "revenue matches", f"{k['booked_revenue']}")
    c.expect(k["empty_mile_ratio"] is None or 0 <= k["empty_mile_ratio"] < 0.5, "empty-mile ratio sane", f"{k['empty_mile_ratio']}")

    print("\n========================================")
    print(f"SUMMARY: {c.passed} passed, {c.failed} failed")
    print("========================================")
    return 1 if c.failed else 0


if __name__ == "__main__":
    sys.exit(main())

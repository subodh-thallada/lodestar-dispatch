#!/usr/bin/env python3
"""Replay the historical dataset through Lodestar's decision policy.

The history has no board, no fleet and no clock, so this is a *policy* backtest, not a
simulation: for every historical load we ask "what would Lodestar have done?" and
compare realised margin against naive policies.

Fixed-rate loads (the carrier's historical decision is `won`):
  naive-all      accept everything that was offered
  cost-plus      accept if offered_rate >= estimated_cost  (zero deadhead assumed)
  lodestar       accept if margin >= min $ AND margin% >= min %, using an expected
                 deadhead of `--deadhead` miles at the row's cost_per_mile

Open-bid loads (counterfactual):
  historical     the bid that was actually placed, with its real outcome
  lodestar       the model's EV-optimal bid above the cost-plus floor; the win
                 probability comes from a model trained on the OTHER 75% of rows, so the
                 expected margin is out-of-sample.

Usage:
  python scripts/backtest.py [--csv board/data/historical_shipments.csv] [--deadhead 35]
"""

from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from lodestar.engine.history import LaneIndex, load_history_file  # noqa: E402
from lodestar.engine.pricing import PricingModel  # noqa: E402


def money(v: float) -> str:
    return f"${v:,.0f}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=str(ROOT / "board" / "data" / "historical_shipments.csv"))
    ap.add_argument("--deadhead", type=float, default=35.0, help="assumed empty miles to each pickup")
    ap.add_argument("--min-margin", type=float, default=150.0)
    ap.add_argument("--min-margin-pct", type=float, default=0.10)
    ap.add_argument("--target-margin-pct", type=float, default=0.18)
    ap.add_argument("--seed", type=int, default=11)
    args = ap.parse_args()

    rows = load_history_file(Path(args.csv))
    index = LaneIndex(rows)
    print(f"History: {len(rows)} rows, {len(index.lanes)} lanes\n")

    # ---------------------------------------------------------------- fixed rate
    fixed = [r for r in rows if r.order_type == "fixed_rate"]
    policies = {"naive-all": [], "cost-plus": [], "lodestar": []}
    for r in fixed:
        dh_cost = args.deadhead * r.cost_per_mile
        total = r.estimated_cost + dh_cost
        margin = r.offered_rate - total
        policies["naive-all"].append(margin)
        if r.offered_rate >= r.estimated_cost:
            policies["cost-plus"].append(margin)
        if margin >= args.min_margin and margin / r.offered_rate >= args.min_margin_pct:
            policies["lodestar"].append(margin)
    hist = [r.offered_rate - (r.estimated_cost + args.deadhead * r.cost_per_mile) for r in fixed if r.won]

    print("FIXED-RATE (Book-It-Now) — realised margin if the policy had been followed")
    print(f"  assumed deadhead {args.deadhead:.0f} mi/load; policy min ${args.min_margin:.0f} and {args.min_margin_pct:.0%}\n")
    print(f"  {'policy':<14}{'loads':>7}{'total margin':>16}{'avg/load':>12}{'loss-making':>13}{'margin/unit-load':>18}")
    rowsout = {"historical (as booked)": hist, **policies}
    for name, ms in rowsout.items():
        if not ms:
            continue
        losers = sum(1 for m in ms if m < 0)
        print(f"  {name:<14}{len(ms):>7}{money(sum(ms)):>16}{money(sum(ms) / len(ms)):>12}{losers:>13}{money(sum(ms) / len(ms)):>18}")
    naive = policies["naive-all"]
    lode = policies["lodestar"]
    print()
    print(f"  Lodestar books {len(lode) / len(naive):.0%} of the loads for {sum(lode) / sum(naive):.0%} of the naive policy's margin,")
    print(f"  with {sum(1 for m in naive if m < 0)} loss-making loads avoided ({money(-sum(m for m in naive if m < 0))} of losses).")
    print(f"  Average margin per booked load: naive {money(sum(naive) / len(naive))} -> Lodestar {money(sum(lode) / len(lode))}.")

    # ----------------------------------------------------------------- open bid
    bids = [r for r in rows if r.order_type == "open_bid" and r.bid_rate]
    rng = random.Random(args.seed)
    idx = list(range(len(bids)))
    rng.shuffle(idx)
    cut = int(len(idx) * 0.75)
    train_rows = [bids[i] for i in idx[:cut]]
    test_rows = [bids[i] for i in idx[cut:]]
    train_index = LaneIndex([r for r in rows if r.order_type == "fixed_rate"] + train_rows)
    model = PricingModel(train_index, seed=args.seed)

    hist_margin = 0.0
    hist_wins = 0
    lode_expected = 0.0
    lode_expected_wins = 0.0
    lode_hist_margin = 0.0  # Lodestar's bid evaluated with the *historical* outcome frequency
    higher = 0
    for r in test_rows:
        dh_cost = args.deadhead * r.cost_per_mile
        total = r.estimated_cost + dh_cost
        if r.won:
            hist_wins += 1
            hist_margin += r.bid_rate - total
        out = model.suggest_bid(
            origin_code=r.origin_code,
            destination_code=r.destination_code,
            miles=r.distance_miles,
            weight_lbs=r.weight_lbs,
            season=r.season,
            total_cost=total,
            min_margin_usd=args.min_margin,
            min_margin_pct=args.min_margin_pct,
            target_margin_pct=args.target_margin_pct,
        )
        lode_expected += out["expected_profit"]
        lode_expected_wins += out["win_probability"]
        if out["suggested_bid"] > r.bid_rate:
            higher += 1
        # Historical bids that lost money when won would have been floored by policy
        lode_hist_margin += max(out["margin_if_won"], 0) * out["win_probability"]

    n = len(test_rows)
    print("\nOPEN BIDS — held-out 25% of historical auctions (model trained on the rest)")
    print(f"  model held-out AUC {model.metrics.auc:.3f}, Brier {model.metrics.brier:.3f}\n")
    print(f"  {'policy':<24}{'auctions':>10}{'wins':>8}{'win rate':>10}{'margin':>14}{'margin/auction':>16}")
    print(f"  {'historical bids':<24}{n:>10}{hist_wins:>8}{hist_wins / n:>10.0%}{money(hist_margin):>14}{money(hist_margin / n):>16}")
    print(f"  {'lodestar (expected)':<24}{n:>10}{lode_expected_wins:>8.0f}{lode_expected_wins / n:>10.0%}{money(lode_expected):>14}{money(lode_expected / n):>16}")
    print()
    print(f"  Lodestar bids above the historical bid on {higher / n:.0%} of auctions; it trades win rate for margin per win,")
    print(f"  and never bids below the cost-plus floor, so no won auction can be loss-making.")
    losers = sum(1 for r in test_rows if r.won and r.bid_rate - (r.estimated_cost + args.deadhead * r.cost_per_mile) < 0)
    print(f"  Historical bids that won but lost money after deadhead: {losers} of {hist_wins}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

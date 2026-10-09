"""Open-bid pricing: a win-probability model plus expected-profit bid search.

A deliberately small, dependency-free model: L2-regularised logistic regression fit by
Newton's method with numpy. Features are things we also know about a *live* order:

    gap        = bid $/mile relative to the lane's market reference (bid/market - 1)
    log_miles  = ln(distance)
    weight_k   = weight in 10k lbs
    season     = one-hot (spring / summer / fall; winter is the baseline)

Given P(win | bid) we search the bid that maximises expected profit
    E[profit](b) = P(win | b) * (b - total_cost)
subject to a cost-plus floor from policy. Dispatchers see the suggested bid, the win
probability and the curve; auto-pilot submits it when guardrails pass.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass

import numpy as np

from lodestar.engine.history import HistoryRow, LaneIndex

SEASONS = ("spring", "summer", "fall")  # winter = baseline
FEATURE_NAMES = ["gap", "log_miles", "weight_k", *[f"season_{s}" for s in SEASONS]]


def _features(gap: float, miles: float, weight_lbs: float, season: str) -> list[float]:
    return [
        gap,
        math.log(max(miles, 1.0)),
        weight_lbs / 10_000.0,
        *[1.0 if season == s else 0.0 for s in SEASONS],
    ]


@dataclass
class ModelMetrics:
    rows: int
    train_rows: int
    test_rows: int
    auc: float
    log_loss: float
    brier: float
    base_rate: float
    calibration: list[dict]
    coefficients: dict[str, float]

    def to_dict(self) -> dict:
        return self.__dict__.copy()


class LogisticModel:
    def __init__(self, l2: float = 1e-2, iters: int = 30):
        self.l2 = l2
        self.iters = iters
        self.mean: np.ndarray | None = None
        self.std: np.ndarray | None = None
        self.w: np.ndarray | None = None  # includes intercept at index 0

    def _design(self, X: np.ndarray) -> np.ndarray:
        Z = (X - self.mean) / self.std
        return np.hstack([np.ones((Z.shape[0], 1)), Z])

    def fit(self, X: np.ndarray, y: np.ndarray) -> "LogisticModel":
        X = np.asarray(X, dtype=float)
        y = np.asarray(y, dtype=float)
        self.mean = X.mean(axis=0)
        self.std = X.std(axis=0)
        self.std[self.std < 1e-9] = 1.0
        A = self._design(X)
        n, d = A.shape
        w = np.zeros(d)
        reg = np.eye(d) * self.l2
        reg[0, 0] = 0.0
        for _ in range(self.iters):
            p = 1.0 / (1.0 + np.exp(-A @ w))
            grad = A.T @ (p - y) / n + reg @ w
            W = p * (1 - p)
            H = (A.T * W) @ A / n + reg
            step = np.linalg.solve(H + np.eye(d) * 1e-8, grad)
            w = w - step
            if np.max(np.abs(step)) < 1e-8:
                break
        self.w = w
        return self

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        A = self._design(np.asarray(X, dtype=float))
        return 1.0 / (1.0 + np.exp(-A @ self.w))


def _auc(y: np.ndarray, p: np.ndarray) -> float:
    pos = p[y == 1]
    neg = p[y == 0]
    if len(pos) == 0 or len(neg) == 0:
        return float("nan")
    # rank-based AUC (Mann-Whitney)
    order = np.argsort(p)
    ranks = np.empty(len(p))
    ranks[order] = np.arange(1, len(p) + 1)
    # average ranks for ties
    _, inv, counts = np.unique(p, return_inverse=True, return_counts=True)
    sums = np.zeros(len(counts))
    np.add.at(sums, inv, ranks)
    ranks = (sums / counts)[inv]
    return float((ranks[y == 1].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)))


class PricingModel:
    def __init__(self, index: LaneIndex, seed: int = 7):
        self.index = index
        self.model = LogisticModel()
        self.metrics: ModelMetrics | None = None
        self.seed = seed
        self._train()

    # --- training ----------------------------------------------------------------
    def _row_features(self, r: HistoryRow) -> list[float] | None:
        if r.order_type != "open_bid" or not r.bid_rate:
            return None
        market, _, _ = self.index.market_rpm(r.origin_code, r.destination_code, r.distance_miles)
        bid_rpm = r.bid_rate / max(r.distance_miles, 1.0)
        return _features(bid_rpm / max(market, 0.01) - 1.0, r.distance_miles, r.weight_lbs, r.season)

    def _train(self) -> None:
        X, y = [], []
        for r in self.index.rows:
            f = self._row_features(r)
            if f is None:
                continue
            X.append(f)
            y.append(1.0 if r.won else 0.0)
        X = np.asarray(X)
        y = np.asarray(y)
        if len(y) < 30:
            raise ValueError("not enough open-bid history to train a pricing model")

        rng = random.Random(self.seed)
        idx = list(range(len(y)))
        rng.shuffle(idx)
        cut = int(len(idx) * 0.75)
        tr, te = idx[:cut], idx[cut:]
        held = LogisticModel().fit(X[tr], y[tr])
        p = np.clip(held.predict_proba(X[te]), 1e-6, 1 - 1e-6)
        yt = y[te]
        ll = float(-np.mean(yt * np.log(p) + (1 - yt) * np.log(1 - p)))
        brier = float(np.mean((p - yt) ** 2))
        bins = []
        edges = np.linspace(0, 1, 6)
        for lo, hi in zip(edges[:-1], edges[1:]):
            m = (p >= lo) & (p < hi) if hi < 1 else (p >= lo) & (p <= hi)
            if m.sum():
                bins.append({"bucket": f"{lo:.1f}-{hi:.1f}", "n": int(m.sum()), "predicted": round(float(p[m].mean()), 3), "actual": round(float(yt[m].mean()), 3)})

        self.model.fit(X, y)
        coefs = {name: round(float(c), 4) for name, c in zip(["intercept", *FEATURE_NAMES], self.model.w)}
        self.metrics = ModelMetrics(
            rows=int(len(y)),
            train_rows=len(tr),
            test_rows=len(te),
            auc=round(_auc(yt, p), 3),
            log_loss=round(ll, 4),
            brier=round(brier, 4),
            base_rate=round(float(y.mean()), 3),
            calibration=bins,
            coefficients=coefs,
        )

    # --- inference ---------------------------------------------------------------
    def market_reference(self, origin_code: str, destination_code: str, miles: float) -> dict:
        rpm, basis, n = self.index.market_rpm(origin_code, destination_code, miles)
        return {"market_rpm": round(rpm, 3), "market_rate": round(rpm * miles, 2), "basis": basis, "sample_size": n}

    def win_probability(self, bid: float, *, origin_code: str, destination_code: str, miles: float, weight_lbs: float, season: str) -> float:
        market, _, _ = self.index.market_rpm(origin_code, destination_code, miles)
        gap = (bid / max(miles, 1.0)) / max(market, 0.01) - 1.0
        return float(self.model.predict_proba(np.asarray([_features(gap, miles, weight_lbs, season)]))[0])

    def suggest_bid(
        self,
        *,
        origin_code: str,
        destination_code: str,
        miles: float,
        weight_lbs: float,
        season: str,
        total_cost: float,
        min_margin_usd: float,
        min_margin_pct: float,
        target_margin_pct: float,
    ) -> dict:
        market, basis, n = self.index.market_rpm(origin_code, destination_code, miles)
        market_rate = market * miles
        floor = max(total_cost + min_margin_usd, total_cost * (1 + min_margin_pct))
        cost_plus = total_cost * (1 + target_margin_pct)
        lo = min(floor, market_rate * 0.8)
        hi = max(market_rate * 1.6, floor * 1.3)
        grid = np.linspace(lo, hi, 61)
        feats = np.asarray([_features((b / max(miles, 1.0)) / max(market, 0.01) - 1.0, miles, weight_lbs, season) for b in grid])
        probs = self.model.predict_proba(feats)
        ev = probs * (grid - total_cost)
        feasible = grid >= floor
        if feasible.any():
            best_i = int(np.argmax(np.where(feasible, ev, -np.inf)))
        else:
            best_i = int(np.argmax(ev))
        best = float(grid[best_i])
        # Never undercut our own cost-plus floor; prefer the EV-optimal when it is above it.
        suggested = max(best, floor)
        p_sugg = float(probs[best_i]) if suggested == best else self.win_probability(
            suggested, origin_code=origin_code, destination_code=destination_code, miles=miles, weight_lbs=weight_lbs, season=season
        )
        curve = [
            {"bid": round(float(b), 0), "p_win": round(float(p), 3), "expected_profit": round(float(e), 0)}
            for b, p, e in zip(grid[::5], probs[::5], ev[::5])
        ]
        return {
            "suggested_bid": round(suggested, 2),
            "win_probability": round(p_sugg, 3),
            "expected_profit": round(p_sugg * (suggested - total_cost), 2),
            "margin_if_won": round(suggested - total_cost, 2),
            "margin_pct_if_won": round((suggested - total_cost) / suggested, 3) if suggested else 0.0,
            "floor_bid": round(floor, 2),
            "cost_plus_bid": round(cost_plus, 2),
            "market_rate": round(market_rate, 2),
            "market_rpm": round(market, 3),
            "market_basis": basis,
            "market_sample_size": n,
            "ev_curve": curve,
        }

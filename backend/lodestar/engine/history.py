"""Historical dataset analytics.

Turns the 2,500-row shipment history into the reference tables the live engine needs:

* per-lane market rate ($/mile), win rates and realised margins
* per-hub *outbound value* — how much a truck parked at that hub tends to earn on its
  next load (drives the chaining / repositioning term of the dispatch score)
* distance-band fallbacks for lanes we have never seen
"""

from __future__ import annotations

import csv
import io
import math
import statistics
from dataclasses import dataclass, field
from pathlib import Path

DISTANCE_BANDS = [(0, 250), (250, 500), (500, 1000), (1000, 1800), (1800, 10_000)]


def _f(value, default=None) -> float | None:
    if value in (None, ""):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _b(value) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "y"}


def _band(miles: float) -> tuple[int, int]:
    for lo, hi in DISTANCE_BANDS:
        if lo <= miles < hi:
            return lo, hi
    return DISTANCE_BANDS[-1]


def season_of(month: int) -> str:
    if month in (12, 1, 2):
        return "winter"
    if month in (3, 4, 5):
        return "spring"
    if month in (6, 7, 8):
        return "summer"
    return "fall"


@dataclass
class HistoryRow:
    lane_id: str
    origin_code: str
    destination_code: str
    origin_state: str
    destination_state: str
    distance_miles: float
    weight_lbs: float
    order_type: str
    offered_rate: float
    bid_rate: float | None
    won: bool
    cost_per_mile: float
    estimated_cost: float
    margin_estimate: float | None
    shipped_at: str
    season: str
    market_rpm: float | None
    all_in_rpm: float | None

    @property
    def payout(self) -> float | None:
        if self.order_type == "open_bid":
            return self.bid_rate
        return self.offered_rate

    @property
    def payout_rpm(self) -> float | None:
        p = self.payout
        return None if p is None else p / max(self.distance_miles, 1.0)


def parse_history_csv(text: str) -> list[HistoryRow]:
    rows: list[HistoryRow] = []
    for raw in csv.DictReader(io.StringIO(text)):
        lane = raw.get("lane_id") or ""
        if "-" not in lane:
            continue
        o, d = lane.split("-", 1)
        miles = _f(raw.get("distance_miles"), 0.0) or 0.0
        if miles <= 0:
            continue
        season = raw.get("season") or ""
        if not season:
            try:
                season = season_of(int(str(raw.get("shipped_at"))[5:7]))
            except ValueError:
                season = "fall"
        rows.append(
            HistoryRow(
                lane_id=lane,
                origin_code=o,
                destination_code=d,
                origin_state=raw.get("origin_state") or "",
                destination_state=raw.get("destination_state") or "",
                distance_miles=miles,
                weight_lbs=_f(raw.get("weight_lbs"), 0.0) or 0.0,
                order_type=raw.get("order_type") or "fixed_rate",
                offered_rate=_f(raw.get("offered_rate"), 0.0) or 0.0,
                bid_rate=_f(raw.get("bid_rate")),
                won=_b(raw.get("won")),
                cost_per_mile=_f(raw.get("cost_per_mile"), 1.8) or 1.8,
                estimated_cost=_f(raw.get("estimated_cost"), miles * 1.8) or miles * 1.8,
                margin_estimate=_f(raw.get("margin_estimate")),
                shipped_at=raw.get("shipped_at") or "",
                season=season,
                market_rpm=_f(raw.get("market_rpm")),
                all_in_rpm=_f(raw.get("all_in_rpm")),
            )
        )
    return rows


def load_history_file(path: Path) -> list[HistoryRow]:
    return parse_history_csv(Path(path).read_text(encoding="utf-8"))


def _reference_rpm(row: HistoryRow) -> float:
    """Best available market reference for a row: the dataset's all-in RPM when present,
    otherwise the posted/offered rate per mile."""
    if row.all_in_rpm:
        return row.all_in_rpm
    return row.offered_rate / max(row.distance_miles, 1.0)


@dataclass
class LaneAgg:
    lane_id: str
    origin_code: str
    destination_code: str
    rpms: list[float] = field(default_factory=list)
    cpms: list[float] = field(default_factory=list)
    miles: list[float] = field(default_factory=list)
    won_margins: list[float] = field(default_factory=list)
    won_margin_pcts: list[float] = field(default_factory=list)
    fixed_n: int = 0
    fixed_won: int = 0
    bid_n: int = 0
    bid_won: int = 0

    @property
    def shipments(self) -> int:
        return len(self.rpms)

    @property
    def wins(self) -> int:
        return self.fixed_won + self.bid_won

    def to_dict(self) -> dict:
        n = max(self.shipments, 1)
        return {
            "lane_id": self.lane_id,
            "origin_code": self.origin_code,
            "destination_code": self.destination_code,
            "shipments": self.shipments,
            "wins": self.wins,
            "win_rate": round(self.wins / n, 3),
            "avg_distance_miles": round(statistics.fmean(self.miles), 1) if self.miles else 0.0,
            "median_market_rpm": round(statistics.median(self.rpms), 3) if self.rpms else 0.0,
            "median_all_in_rpm": round(statistics.median(self.rpms), 3) if self.rpms else 0.0,
            "avg_cost_per_mile": round(statistics.fmean(self.cpms), 3) if self.cpms else 0.0,
            "avg_margin_won": round(statistics.fmean(self.won_margins), 2) if self.won_margins else None,
            "avg_margin_pct_won": round(statistics.fmean(self.won_margin_pcts), 3) if self.won_margin_pcts else None,
            "fixed_rate_accept_rate": round(self.fixed_won / self.fixed_n, 3) if self.fixed_n else None,
            "open_bid_win_rate": round(self.bid_won / self.bid_n, 3) if self.bid_n else None,
        }


class LaneIndex:
    """Reference tables computed from history. Cheap to build (ms for 2.5k rows)."""

    def __init__(self, rows: list[HistoryRow]):
        self.rows = rows
        self.lanes: dict[str, LaneAgg] = {}
        self.hub_out_rpm: dict[str, list[float]] = {}
        self.hub_out_margin: dict[str, list[float]] = {}
        self.hub_out_count: dict[str, int] = {}
        self.band_rpm: dict[tuple[int, int], list[float]] = {}
        self.global_rpm: list[float] = []
        self.global_cpm: list[float] = []
        self._build()

    def _build(self) -> None:
        for r in self.rows:
            agg = self.lanes.setdefault(r.lane_id, LaneAgg(r.lane_id, r.origin_code, r.destination_code))
            ref = _reference_rpm(r)
            agg.rpms.append(ref)
            agg.cpms.append(r.cost_per_mile)
            agg.miles.append(r.distance_miles)
            if r.order_type == "fixed_rate":
                agg.fixed_n += 1
                agg.fixed_won += int(r.won)
            else:
                agg.bid_n += 1
                agg.bid_won += int(r.won)
            if r.won and r.payout:
                margin = r.margin_estimate if r.margin_estimate is not None else r.payout - r.estimated_cost
                agg.won_margins.append(margin)
                agg.won_margin_pcts.append(margin / r.payout)
                self.hub_out_margin.setdefault(r.origin_code, []).append(margin)
            self.hub_out_rpm.setdefault(r.origin_code, []).append(ref)
            self.hub_out_count[r.origin_code] = self.hub_out_count.get(r.origin_code, 0) + 1
            self.band_rpm.setdefault(_band(r.distance_miles), []).append(ref)
            self.global_rpm.append(ref)
            self.global_cpm.append(r.cost_per_mile)

    # --- market reference ----------------------------------------------------
    def market_rpm(self, origin_code: str, destination_code: str, miles: float) -> tuple[float, str, int]:
        """Returns (rpm, basis, sample_size). basis: lane | hub | band | global."""
        lane = self.lanes.get(f"{origin_code}-{destination_code}")
        if lane and lane.shipments >= 5:
            return statistics.median(lane.rpms), "lane", lane.shipments
        band = self.band_rpm.get(_band(miles), [])
        hub = self.hub_out_rpm.get(origin_code, [])
        if hub and band:
            # hub strength relative to network, applied to the distance-band curve
            hub_factor = statistics.median(hub) / max(statistics.median(self.global_rpm), 0.01)
            return statistics.median(band) * hub_factor, "hub", len(hub)
        if band:
            return statistics.median(band), "band", len(band)
        return (statistics.median(self.global_rpm) if self.global_rpm else 2.6), "global", len(self.global_rpm)

    def avg_cost_per_mile(self) -> float:
        return statistics.fmean(self.global_cpm) if self.global_cpm else 1.8

    # --- hub value (chaining) ------------------------------------------------
    def hub_outbound_value(self, code: str) -> float:
        """Average realised margin of a won load leaving `code` (USD per load)."""
        margins = self.hub_out_margin.get(code)
        if not margins:
            return self.network_outbound_value()
        return statistics.fmean(margins)

    def network_outbound_value(self) -> float:
        allm = [m for ms in self.hub_out_margin.values() for m in ms]
        return statistics.fmean(allm) if allm else 0.0

    def hub_table(self) -> list[dict]:
        total = max(sum(self.hub_out_count.values()), 1)
        out = []
        for code, n in sorted(self.hub_out_count.items()):
            margins = self.hub_out_margin.get(code, [])
            out.append(
                {
                    "hub": code,
                    "outbound_loads": n,
                    "volume_share": round(n / total, 3),
                    "median_outbound_rpm": round(statistics.median(self.hub_out_rpm[code]), 3),
                    "avg_won_margin": round(statistics.fmean(margins), 2) if margins else None,
                    "outbound_value": round(self.hub_outbound_value(code), 2),
                }
            )
        return out

    def lane_table(self) -> list[dict]:
        return sorted((a.to_dict() for a in self.lanes.values()), key=lambda d: -d["shipments"])

    def summary(self) -> dict:
        won = [r for r in self.rows if r.won]
        fixed = [r for r in self.rows if r.order_type == "fixed_rate"]
        bids = [r for r in self.rows if r.order_type == "open_bid"]
        margins = [r.margin_estimate for r in won if r.margin_estimate is not None]
        neg = [m for m in margins if m < 0]
        return {
            "rows": len(self.rows),
            "lanes": len(self.lanes),
            "fixed_rate_rows": len(fixed),
            "fixed_rate_accept_rate": round(sum(r.won for r in fixed) / max(len(fixed), 1), 3),
            "open_bid_rows": len(bids),
            "open_bid_win_rate": round(sum(r.won for r in bids) / max(len(bids), 1), 3),
            "won_loads": len(won),
            "avg_margin_won": round(statistics.fmean(margins), 2) if margins else None,
            "median_margin_won": round(statistics.median(margins), 2) if margins else None,
            "won_loads_with_negative_margin": len(neg),
            "negative_margin_share": round(len(neg) / max(len(margins), 1), 3),
            "median_market_rpm": round(statistics.median(self.global_rpm), 3) if self.global_rpm else None,
            "avg_cost_per_mile": round(self.avg_cost_per_mile(), 3),
            "network_outbound_value": round(self.network_outbound_value(), 2),
        }


def band_label(miles: float) -> str:
    lo, hi = _band(miles)
    return f"{lo}-{hi if hi < 10_000 else '+'} mi"


def seasonal_weight(season: str) -> float:  # small informational multiplier used in UI only
    return {"winter": 1.04, "spring": 1.02, "summer": 1.06, "fall": 1.08}.get(season, 1.0) / 1.05


def log1p_safe(x: float) -> float:
    return math.log1p(max(x, 0.0))

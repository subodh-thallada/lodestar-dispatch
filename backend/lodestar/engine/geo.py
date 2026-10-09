"""Geometry helpers: great-circle distance, travel time, position interpolation."""

from __future__ import annotations

import math
from datetime import datetime, timedelta

EARTH_RADIUS_MILES = 3958.8


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return round(2 * EARTH_RADIUS_MILES * math.asin(math.sqrt(a)), 1)


def travel_time(miles: float, speed_mph: float) -> timedelta:
    if miles <= 0:
        return timedelta(0)
    return timedelta(hours=miles / max(speed_mph, 1.0))


def interpolate(
    lat1: float, lon1: float, lat2: float, lon2: float, start: datetime, end: datetime, at: datetime
) -> tuple[float, float, float]:
    """Linear position along a leg at time `at`; returns (lat, lon, progress 0..1)."""
    total = (end - start).total_seconds()
    if total <= 0:
        return lat2, lon2, 1.0
    f = (at - start).total_seconds() / total
    f = max(0.0, min(1.0, f))
    return lat1 + (lat2 - lat1) * f, lon1 + (lon2 - lon1) * f, f


def nearest_hub(lat: float, lon: float, hubs: list) -> object | None:
    """`hubs` is any iterable of objects with latitude/longitude attributes."""
    best, best_d = None, float("inf")
    for h in hubs:
        d = (h.latitude - lat) ** 2 + (h.longitude - lon) ** 2
        if d < best_d:
            best, best_d = h, d
    return best

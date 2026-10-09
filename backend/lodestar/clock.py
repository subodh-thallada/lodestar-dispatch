"""Mirror of the board's simulation clock.

The board runs an accelerated 'brokerage clock'. Every pickup, delivery, expiry and
lock window is expressed in *sim time*, so Lodestar keeps a local projection of it:
sim_now = sim_at_sync + (wall_now - wall_at_sync) * speed. Re-synced on every poll.
"""

from __future__ import annotations

from datetime import datetime, timedelta


def parse_ts(value: str | datetime | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    text = str(value).strip()
    if text.endswith("Z"):
        text = text[:-1]
    if "+" in text[10:]:
        text = text.split("+", 1)[0]
    return datetime.fromisoformat(text)


def iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.replace(microsecond=0).isoformat() + "Z"


class SimClock:
    def __init__(self) -> None:
        self._wall_at_sync = datetime.utcnow()
        self._sim_at_sync = self._wall_at_sync
        self.speed = 1.0
        self.synced = False
        self.last_sync_wall: datetime | None = None

    def sync(self, sim_time_utc: str | datetime, speed: float) -> None:
        sim = parse_ts(sim_time_utc)
        if sim is None:
            return
        self._wall_at_sync = datetime.utcnow()
        self._sim_at_sync = sim
        self.speed = float(speed)
        self.synced = True
        self.last_sync_wall = self._wall_at_sync

    def now(self) -> datetime:
        elapsed = (datetime.utcnow() - self._wall_at_sync).total_seconds()
        return self._sim_at_sync + timedelta(seconds=elapsed * self.speed)

    def sim_to_wall(self, sim_time: datetime) -> datetime:
        """Wall-clock instant at which the sim clock will read `sim_time`."""
        delta = (sim_time - self.now()).total_seconds() / max(self.speed, 1e-9)
        return datetime.utcnow() + timedelta(seconds=delta)

    def snapshot(self) -> dict:
        return {
            "sim_time_utc": iso(self.now()),
            "wall_time_utc": iso(datetime.utcnow()),
            "simulation_speed": self.speed,
            "synced": self.synced,
            "last_sync_wall_utc": iso(self.last_sync_wall),
        }


clock = SimClock()

"""Process-wide singletons that are built at boot (board client, analytics, model)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from lodestar.board.client import BoardClient
from lodestar.engine.history import LaneIndex
from lodestar.engine.pricing import PricingModel


@dataclass
class IngestStatus:
    board_reachable: bool = False
    mode: str = "starting"  # starting | websocket | polling | disconnected
    last_ws_event_at: Optional[datetime] = None
    last_poll_at: Optional[datetime] = None
    last_fleet_sync_at: Optional[datetime] = None
    ws_events: int = 0
    poll_cycles: int = 0
    orders_seen: int = 0
    last_error: Optional[str] = None
    board_restarts_detected: int = 0
    history_source: str = "none"
    history_rows: int = 0
    booted_at: Optional[datetime] = None

    def to_dict(self) -> dict:
        def _iso(v):
            return v.isoformat() + "Z" if v else None

        return {
            "board_reachable": self.board_reachable,
            "mode": self.mode,
            "last_ws_event_at": _iso(self.last_ws_event_at),
            "last_poll_at": _iso(self.last_poll_at),
            "last_fleet_sync_at": _iso(self.last_fleet_sync_at),
            "ws_events": self.ws_events,
            "poll_cycles": self.poll_cycles,
            "orders_seen": self.orders_seen,
            "last_error": self.last_error,
            "board_restarts_detected": self.board_restarts_detected,
            "history_source": self.history_source,
            "history_rows": self.history_rows,
            "booted_at": _iso(self.booted_at),
        }


@dataclass
class AppState:
    board: Optional[BoardClient] = None
    index: Optional[LaneIndex] = None
    pricing: Optional[PricingModel] = None
    ingest: IngestStatus = field(default_factory=IngestStatus)
    autopilot_last_run: Optional[datetime] = None
    autopilot_runs: int = 0
    autopilot_actions: int = 0


state = AppState()

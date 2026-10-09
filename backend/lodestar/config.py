from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BASE_DIR.parent


class Settings(BaseSettings):
    """Process-level configuration. Dispatch *policy* lives in the DB (see PolicySettings)
    so it can be tuned live from the UI; these are the boot defaults."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="LODESTAR_", extra="ignore")

    app_name: str = "Lodestar Dispatch"
    board_url: str = "http://127.0.0.1:8000"
    database_url: str = f"sqlite:///{BASE_DIR / 'lodestar.db'}"
    # Local copy of the board's history CSV; used if the board is unreachable at boot.
    history_csv: Path = REPO_DIR / "board" / "data" / "historical_shipments.csv"

    # Ingestion cadence (wall-clock seconds)
    poll_interval_seconds: float = 3.0
    fleet_sync_seconds: float = 4.0
    ws_reconnect_seconds: float = 3.0

    # Policy defaults (editable at runtime via PUT /api/policy)
    min_margin_usd: float = 150.0
    min_margin_pct: float = 0.10
    max_deadhead_miles: float = 150.0
    reserve_units_per_terminal: int = 1
    target_bid_margin_pct: float = 0.18
    avg_speed_mph: float = 50.0
    turnaround_buffer_minutes: int = 60
    chain_weight: float = 0.35
    count_pending_bids_against_capacity: bool = True
    autopilot_mode: str = "advise"  # off | advise | execute
    autopilot_auto_decline: bool = True
    autopilot_interval_seconds: float = 2.0
    min_seconds_remaining: int = 8


settings = Settings()

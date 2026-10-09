"""Thin async client for the Freight Challenge load board."""

from __future__ import annotations

from typing import Any

import httpx

from lodestar.config import settings


class BoardError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(f"board {status_code}: {detail}")
        self.status_code = status_code
        self.detail = detail


class BoardUnavailable(BoardError):
    def __init__(self, detail: str):
        super().__init__(503, detail)


class BoardClient:
    def __init__(self, base_url: str | None = None, timeout: float = 15.0):
        self.base_url = (base_url or settings.board_url).rstrip("/")
        self._client = httpx.AsyncClient(base_url=self.base_url, timeout=timeout)

    @property
    def ws_url(self) -> str:
        scheme = "wss" if self.base_url.startswith("https") else "ws"
        host = self.base_url.split("://", 1)[1]
        return f"{scheme}://{host}/orders/ws"

    async def close(self) -> None:
        await self._client.aclose()

    async def _request(self, method: str, path: str, **kw) -> Any:
        try:
            resp = await self._client.request(method, path, **kw)
        except httpx.HTTPError as exc:
            raise BoardUnavailable(f"{type(exc).__name__}: {exc}") from exc
        if resp.status_code >= 400:
            detail: str
            try:
                body = resp.json()
                detail = body.get("detail") if isinstance(body, dict) else str(body)
            except ValueError:
                detail = resp.text[:300]
            raise BoardError(resp.status_code, str(detail))
        if "json" in resp.headers.get("content-type", ""):
            return resp.json()
        return resp.text

    # --- reads -----------------------------------------------------------------
    async def health(self) -> dict:
        return await self._request("GET", "/health")

    async def clock(self) -> dict:
        return await self._request("GET", "/simulation/clock")

    async def simulation_settings(self) -> dict:
        return await self._request("GET", "/simulation/settings")

    async def terminals(self) -> list[dict]:
        return await self._request("GET", "/terminals")

    async def fleet_snapshot(self) -> list[dict]:
        return await self._request("GET", "/fleet/snapshot")

    async def orders(self, status: str = "open", order_type: str | None = None) -> list[dict]:
        params: dict[str, str] = {"status": status}
        if order_type:
            params["order_type"] = order_type
        return await self._request("GET", "/orders", params=params)

    async def order(self, external_id: str) -> dict:
        return await self._request("GET", f"/orders/{external_id}")

    async def history_csv(self) -> str:
        return await self._request("GET", "/history/shipments.csv")

    # --- writes ----------------------------------------------------------------
    async def accept(self, external_id: str, note: str | None = None) -> dict:
        return await self._request("POST", f"/orders/{external_id}/accept", json={"carrier_note": note})

    async def decline(self, external_id: str, note: str | None = None) -> dict:
        return await self._request("POST", f"/orders/{external_id}/decline", json={"carrier_note": note})

    async def bid(self, external_id: str, bid_rate: float, note: str | None = None) -> dict:
        return await self._request(
            "POST", f"/orders/{external_id}/bid", json={"bid_rate": round(bid_rate, 2), "carrier_note": note}
        )

    # --- demo controls (proxied for convenience) ---------------------------------
    async def set_speed(self, speed: float) -> dict:
        return await self._request("POST", "/simulation/clock", json={"simulation_speed": speed})

    async def set_settings(self, **body) -> dict:
        return await self._request("POST", "/simulation/settings", json=body)

    async def spawn_orders(self, count: int = 6) -> dict:
        return await self._request("POST", "/simulation/spawn-orders", json={"count": count})

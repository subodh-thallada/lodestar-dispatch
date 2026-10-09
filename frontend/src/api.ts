import type {
  ActionResult,
  Decision,
  Evaluation,
  Forecast,
  HistoryAnalytics,
  Kpis,
  ModelMetrics,
  Policy,
  Schedule,
  Shipment,
  Status,
  TerminalRow,
  Unit,
} from './types'

export class ApiError extends Error {
  status: number
  payload: unknown
  constructor(status: number, message: string, payload?: unknown) {
    super(message)
    this.status = status
    this.payload = payload
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!res.ok) {
    const detail = (body as { detail?: unknown })?.detail
    const message =
      typeof detail === 'string'
        ? detail
        : (detail as { message?: string })?.message ?? `HTTP ${res.status}`
    throw new ApiError(res.status, message, detail ?? body)
  }
  return body as T
}

export const api = {
  status: () => request<Status>('/api/status'),
  shipments: (status = 'open') =>
    request<{ sim_time: string; count: number; shipments: Shipment[] }>(`/api/shipments?status=${status}`),
  shipment: (id: string) => request<{ shipment: Shipment; decisions: Decision[] }>(`/api/shipments/${id}`),
  evaluate: (id: string) => request<Evaluation>(`/api/shipments/${id}/evaluate`),
  act: (id: string, action: 'accept' | 'decline' | 'bid', body: { bid_rate?: number; override?: boolean; note?: string } = {}) =>
    request<ActionResult>(`/api/shipments/${id}/${action}`, { method: 'POST', body: JSON.stringify(body) }),
  terminals: () => request<{ sim_time: string; terminals: TerminalRow[] }>('/api/terminals'),
  units: () => request<{ sim_time: string; units: Unit[] }>('/api/fleet/units'),
  schedule: (back = 6, ahead = 48) => request<Schedule>(`/api/schedule?hours_back=${back}&hours_ahead=${ahead}`),
  forecast: () => request<Forecast>('/api/capacity/forecast'),
  kpis: () => request<Kpis>('/api/kpis'),
  decisions: (limit = 80) => request<{ decisions: Decision[] }>(`/api/decisions?limit=${limit}`),
  policy: () => request<Policy>('/api/policy'),
  updatePolicy: (p: Partial<Policy>) => request<Policy>('/api/policy', { method: 'PUT', body: JSON.stringify(p) }),
  setAutopilot: (mode: Policy['autopilot_mode']) =>
    request<{ mode: string }>('/api/autopilot', { method: 'PUT', body: JSON.stringify({ mode }) }),
  runAutopilot: () => request<Record<string, number>>('/api/autopilot/run', { method: 'POST' }),
  history: () => request<HistoryAnalytics>('/api/analytics/history'),
  model: () => request<ModelMetrics>('/api/analytics/model'),
  setSpeed: (speed: number) => request('/api/sim/speed', { method: 'POST', body: JSON.stringify({ simulation_speed: speed }) }),
  spawn: (count = 6) => request('/api/sim/spawn', { method: 'POST', body: JSON.stringify({ count }) }),
  setInterval: (seconds: number) =>
    request('/api/sim/interval', { method: 'POST', body: JSON.stringify({ order_interval_seconds: seconds }) }),
}

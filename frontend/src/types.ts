export type OrderType = 'fixed_rate' | 'open_bid'
export type Recommendation = 'accept' | 'decline' | 'bid' | 'hold' | 'skip'

export interface Guardrail {
  name: string
  passed: boolean
  detail: string
  overridable: boolean
}

export interface HubCapacity {
  code: string
  total: number
  usable: number
  board_free: number
  projected_free: number
  soft_locked: number
  reserve: number
}

export interface LockPlan {
  unit_id: number
  unit_number: string
  feasible: boolean
  reason: string
  deadhead_miles: number
  depart_at: string
  starts_at: string
  ends_at: string
  free_from: string
  lock_hours: number
  conflict_external_id: string | null
  positioned_by: string | null
}

export interface Pricing {
  suggested_bid: number
  win_probability: number
  expected_profit: number
  margin_if_won: number
  margin_pct_if_won: number
  floor_bid: number
  cost_plus_bid: number
  market_rate: number
  market_rpm: number
  market_basis: string
  market_sample_size: number
  ev_curve: { bid: number; p_win: number; expected_profit: number }[]
}

export interface Evaluation {
  external_id: string
  order_type: OrderType
  recommendation: Recommendation
  bookable: boolean
  guardrails: Guardrail[]
  reasons: string[]
  payout: number | null
  loaded_cost: number
  deadhead_miles: number
  deadhead_cost: number
  total_cost: number
  margin: number | null
  margin_pct: number | null
  margin_per_hour: number | null
  lock_hours: number | null
  chain_value: number
  drain_penalty: number
  score: number | null
  predicted_unit: LockPlan | null
  best_unit: LockPlan | null
  candidates: LockPlan[]
  origin_capacity: HubCapacity | null
  destination_capacity: HubCapacity | null
  market: { market_rpm?: number; market_rate?: number; basis?: string; sample_size?: number; offer_vs_market_pct?: number }
  pricing: Pricing | null
  board_deadhead_miles: number
  seconds_remaining: number
  evaluated_at: string
}

export interface Place {
  city: string
  state: string
  latitude: number
  longitude: number
  terminal_code: string | null
  hub_code: string
}

export interface Shipment {
  id: number
  external_id: string
  order_type: OrderType
  status: string
  lane_id: string
  origin: Place
  destination: Place
  distance_miles: number
  weight_lbs: number
  offered_rate: number | null
  cost_per_mile: number
  estimated_cost: number
  board_deadhead_miles: number
  board_deadhead_cost: number
  pickup_at: string
  delivery_at: string
  expires_at: string
  seconds_remaining: number
  board_created_at: string
  first_seen_at: string
  our_bid_rate: number | null
  bid_decision_at: string | null
  assigned_unit_id: number | null
  assigned_unit_number: string | null
  assigned_terminal_code: string | null
  booked_by: string | null
  booked_at: string | null
  payout: number | null
  booked_deadhead_miles: number | null
  booked_deadhead_cost: number | null
  booked_total_cost: number | null
  booked_margin: number | null
  recommendation: Recommendation | null
  evaluation: Evaluation | null
  evaluated_at: string | null
}

export interface TerminalRow {
  code: string
  name: string
  city: string
  state: string
  latitude: number
  longitude: number
  total_units: number
  usable_units: number
  free_units: number
  busy_units: number
  soft_locked_units: number
  committed_units: number
  out_of_service: number
  board_free_units: number
  utilization: number
  open_loads_from_here: number
  reserve: number
  level: 'ok' | 'warning' | 'critical'
}

export interface LockRow {
  id: number
  unit_id: number
  unit_number: string | null
  shipment_id: number
  external_id: string | null
  lane_id: string | null
  status_of_load: string | null
  kind: 'hard' | 'soft'
  status: 'active' | 'released'
  starts_at: string
  depart_at: string
  pickup_at: string
  delivery_at: string
  ends_at: string
  deadhead_miles: number
  payout: number | null
  margin: number | null
  origin_city: string | null
  destination_city: string | null
  released_at: string | null
  release_reason: string | null
}

export interface Unit {
  id: number
  unit_number: string
  employee_code: string
  driver_name: string
  home_terminal_code: string
  board_status: string
  board_available_at: string | null
  phase: string
  latitude: number
  longitude: number
  progress: number | null
  current_lock: LockRow | null
  upcoming_locks: LockRow[]
}

export interface ScheduleUnit {
  id: number
  unit_number: string
  driver_name: string
  home_terminal_code: string
  board_status: string
  locks: LockRow[]
}

export interface Schedule {
  sim_time: string
  window: { from: string; to: string }
  units: ScheduleUnit[]
}

export interface ForecastPoint {
  hours_ahead: number
  at: string
  free: number
  inbound: number
}

export interface Forecast {
  sim_time: string
  horizons_hours: number[]
  terminals: Record<string, ForecastPoint[]>
  totals: Record<string, number>
  warnings: { terminal_code: string; level: 'critical' | 'warning' | 'info'; message: string }[]
}

export interface Kpis {
  sim_time: string
  opportunities_seen: number
  by_status: Record<string, number>
  booked_loads: number
  booked_revenue: number
  booked_cost: number
  booked_margin: number
  booked_margin_pct: number | null
  avg_margin_per_load: number | null
  loaded_miles: number
  deadhead_miles: number
  empty_mile_ratio: number | null
  revenue_per_loaded_mile: number | null
  fleet_units: number
  units_busy_now: number
  utilization_now: number | null
  bids_submitted: number
  bids_won: number
  bids_lost: number
  bids_pending: number
  bid_win_rate: number | null
  bid_exposure_usd: number
  declined_loads: number
  losses_avoided_usd: number
  decisions_by_actor: Record<string, number>
  guardrail_blocks: number
  board_rejections: number
}

export interface Decision {
  id: number
  external_id: string
  actor: string
  action: string
  outcome: string
  bid_rate: number | null
  expected_margin: number | null
  deadhead_miles: number | null
  score: number | null
  override: boolean
  guardrails: Guardrail[] | null
  reasons: string[] | null
  board_status_code: number | null
  message: string | null
  created_at: string
  sim_time: string
  lane_id: string | null
  order_type: OrderType | null
}

export interface Policy {
  min_margin_usd: number
  min_margin_pct: number
  max_deadhead_miles: number
  reserve_units_per_terminal: number
  target_bid_margin_pct: number
  avg_speed_mph: number
  turnaround_buffer_minutes: number
  chain_weight: number
  count_pending_bids_against_capacity: boolean
  autopilot_mode: 'off' | 'advise' | 'execute'
  autopilot_auto_decline: boolean
  max_weight_lbs: number
}

export interface ClockSnap {
  sim_time_utc: string
  wall_time_utc: string
  simulation_speed: number
  synced: boolean
}

export interface IngestStatus {
  board_reachable: boolean
  mode: string
  last_ws_event_at: string | null
  last_poll_at: string | null
  ws_events: number
  poll_cycles: number
  orders_seen: number
  last_error: string | null
  board_restarts_detected: number
  history_source: string
  history_rows: number
}

export interface Status {
  clock: ClockSnap
  ingest: IngestStatus
  policy: Policy
  autopilot: { mode: string; runs: number; actions: number; last_run_at: string | null; interval_seconds: number }
  ws_clients: number
  board_url: string
}

export interface LaneStat {
  lane_id: string
  origin_code: string
  destination_code: string
  shipments: number
  wins: number
  win_rate: number
  avg_distance_miles: number
  median_market_rpm: number
  avg_cost_per_mile: number
  avg_margin_won: number | null
  avg_margin_pct_won: number | null
  fixed_rate_accept_rate: number | null
  open_bid_win_rate: number | null
}

export interface HistoryAnalytics {
  summary: Record<string, number | string | null>
  hubs: { hub: string; outbound_loads: number; volume_share: number; median_outbound_rpm: number; avg_won_margin: number | null; outbound_value: number }[]
  lanes: LaneStat[]
  source: string
}

export interface ModelMetrics {
  model: string
  features: string[]
  rows: number
  train_rows: number
  test_rows: number
  auc: number
  log_loss: number
  brier: number
  base_rate: number
  calibration: { bucket: string; n: number; predicted: number; actual: number }[]
  coefficients: Record<string, number>
}

export interface ActionResult {
  ok: boolean
  outcome: string
  status_code: number
  message: string
  decision_id: number | null
  lock_events: string[]
  shipment: Shipment
  evaluation: Evaluation
}

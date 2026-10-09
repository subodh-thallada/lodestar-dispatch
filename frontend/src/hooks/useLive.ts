import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { ClockSnap, Decision, Forecast, IngestStatus, Kpis, Policy, Shipment, Status, TerminalRow, Unit } from '../types'

export interface LiveState {
  status: Status | null
  clock: ClockSnap | null
  ingest: IngestStatus | null
  policy: Policy | null
  open: Shipment[]
  active: Shipment[]
  history: Shipment[]
  terminals: TerminalRow[]
  units: Unit[]
  forecast: Forecast | null
  kpis: Kpis | null
  decisions: Decision[]
  wsConnected: boolean
  lastEvent: string | null
}

type Event = { event: string; data: unknown }

/** One socket + a handful of fetchers; every panel reads from this store. */
export function useLive() {
  const [state, setState] = useState<LiveState>({
    status: null,
    clock: null,
    ingest: null,
    policy: null,
    open: [],
    active: [],
    history: [],
    terminals: [],
    units: [],
    forecast: null,
    kpis: null,
    decisions: [],
    wsConnected: false,
    lastEvent: null,
  })
  const timers = useRef<Record<string, number>>({})

  const refreshShipments = useCallback(async () => {
    const [o, a, h] = await Promise.all([api.shipments('open'), api.shipments('active'), api.shipments('history')])
    setState((s) => ({ ...s, open: o.shipments, active: a.shipments, history: h.shipments }))
  }, [])

  const refreshFleet = useCallback(async () => {
    const [t, u, f] = await Promise.all([api.terminals(), api.units(), api.forecast()])
    setState((s) => ({ ...s, terminals: t.terminals, units: u.units, forecast: f }))
  }, [])

  const refreshKpis = useCallback(async () => {
    const [k, d] = await Promise.all([api.kpis(), api.decisions(80)])
    setState((s) => ({ ...s, kpis: k, decisions: d.decisions }))
  }, [])

  const refreshStatus = useCallback(async () => {
    const st = await api.status()
    setState((s) => ({ ...s, status: st, clock: st.clock, ingest: st.ingest, policy: st.policy }))
  }, [])

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([refreshStatus(), refreshShipments(), refreshFleet(), refreshKpis()])
  }, [refreshStatus, refreshShipments, refreshFleet, refreshKpis])

  // Debounce bursts of events into one refetch per channel.
  const schedule = useCallback((key: string, fn: () => Promise<void>, delay = 150) => {
    window.clearTimeout(timers.current[key])
    timers.current[key] = window.setTimeout(() => {
      fn().catch(() => undefined)
    }, delay)
  }, [])

  useEffect(() => {
    refreshAll().catch(() => undefined)
    let ws: WebSocket | null = null
    let closed = false
    let retry = 1000

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/api/ws`)
      ws.onopen = () => {
        retry = 1000
        setState((s) => ({ ...s, wsConnected: true }))
      }
      ws.onclose = () => {
        setState((s) => ({ ...s, wsConnected: false }))
        if (!closed) window.setTimeout(connect, (retry = Math.min(retry * 1.5, 8000)))
      }
      ws.onmessage = (m) => {
        let msg: Event
        try {
          msg = JSON.parse(m.data)
        } catch {
          return
        }
        setState((s) => ({ ...s, lastEvent: msg.event }))
        switch (msg.event) {
          case 'clock':
            setState((s) => ({ ...s, clock: msg.data as ClockSnap }))
            break
          case 'hello':
            setState((s) => ({ ...s, clock: (msg.data as { clock: ClockSnap }).clock }))
            break
          case 'shipments.changed':
          case 'shipment.updated':
          case 'shipment.created':
            schedule('ships', refreshShipments)
            schedule('kpis', refreshKpis, 400)
            break
          case 'fleet.changed':
            schedule('fleet', refreshFleet)
            schedule('kpis', refreshKpis, 400)
            break
          case 'decision.created':
            setState((s) => ({ ...s, decisions: [msg.data as Decision, ...s.decisions].slice(0, 200) }))
            schedule('kpis', refreshKpis, 400)
            break
          case 'policy.updated':
            setState((s) => ({ ...s, policy: msg.data as Policy }))
            schedule('ships', refreshShipments)
            break
          case 'autopilot.tick':
            schedule('ships', refreshShipments)
            schedule('fleet', refreshFleet)
            schedule('status', refreshStatus, 300)
            break
        }
      }
    }
    connect()
    const keepalive = window.setInterval(() => ws?.readyState === 1 && ws.send('ping'), 15000)
    // Polling fallback keeps the UI honest even if the socket is blocked.
    const poll = window.setInterval(() => {
      refreshStatus().catch(() => undefined)
      refreshShipments().catch(() => undefined)
      refreshFleet().catch(() => undefined)
    }, 5000)
    return () => {
      closed = true
      window.clearInterval(keepalive)
      window.clearInterval(poll)
      ws?.close()
      Object.values(timers.current).forEach((t) => window.clearTimeout(t))
    }
  }, [refreshAll, refreshShipments, refreshFleet, refreshKpis, refreshStatus, schedule])

  return { ...state, refreshAll, refreshShipments, refreshFleet, refreshKpis, refreshStatus }
}

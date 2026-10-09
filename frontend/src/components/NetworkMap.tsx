import { useMemo } from 'react'
import type { Shipment, TerminalRow, Unit } from '../types'

// Stylised outline of the contiguous US (lat, lon), enough to anchor the hubs visually.
const OUTLINE: [number, number][] = [
  [48.4, -124.7], [46.2, -124.0], [42.0, -124.4], [40.4, -124.4], [38.0, -123.0], [36.6, -121.9], [34.4, -120.5], [33.7, -118.3], [32.5, -117.1],
  [32.7, -114.7], [31.3, -111.0], [31.8, -106.5], [29.8, -104.5], [29.3, -103.2], [29.8, -101.5], [27.5, -99.5], [26.0, -97.2],
  [27.8, -97.0], [29.5, -94.8], [29.3, -91.0], [30.2, -89.0], [30.4, -87.5], [30.0, -85.5], [29.0, -83.0], [26.0, -81.8], [25.1, -80.9], [26.5, -80.0], [28.5, -80.6], [30.4, -81.4],
  [32.0, -80.9], [33.9, -78.0], [35.3, -75.5], [36.9, -76.0], [38.9, -75.0], [40.5, -74.0], [41.2, -71.9], [42.0, -70.0], [43.0, -70.6], [44.8, -67.0], [47.3, -68.0],
  [45.0, -71.5], [45.0, -74.8], [43.6, -76.5], [43.3, -79.0], [42.3, -83.0], [45.8, -84.5], [46.5, -87.5], [48.0, -89.5], [49.0, -95.2], [49.0, -124.7],
]

const W = 960
const H = 560
const LON0 = -126
const LON1 = -66
const LAT0 = 24
const LAT1 = 50

export function project(lat: number, lon: number): [number, number] {
  const x = ((lon - LON0) / (LON1 - LON0)) * W
  const y = ((LAT1 - lat) / (LAT1 - LAT0)) * H
  return [x, y]
}

function arc(a: [number, number], b: [number, number]): string {
  const mx = (a[0] + b[0]) / 2
  const my = (a[1] + b[1]) / 2
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  const k = Math.min(60, len * 0.18)
  const cx = mx - (dy / len) * k
  const cy = my + (dx / len) * k
  return `M ${a[0]} ${a[1]} Q ${cx} ${cy} ${b[0]} ${b[1]}`
}

export function NetworkMap({ terminals, units, active, open, selected, onSelect }: { terminals: TerminalRow[]; units: Unit[]; active: Shipment[]; open: Shipment[]; selected: string | null; onSelect: (code: string | null) => void }) {
  const outline = useMemo(() => OUTLINE.map(([la, lo]) => project(la, lo).join(',')).join(' '), [])
  const byCode = useMemo(() => Object.fromEntries(terminals.map((t) => [t.code, t])), [terminals])
  const moving = units.filter((u) => u.phase === 'in_transit' || u.phase === 'deadheading')
  const lanes = active.filter((s) => s.status === 'accepted' || s.status === 'in_transit')
  const bids = active.filter((s) => s.status === 'bid_submitted')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full select-none" role="img" aria-label="Network map of terminals, active lanes and moving units">
      <defs>
        <radialGradient id="hubGlow">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
        </radialGradient>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#38bdf8" opacity="0.8" />
        </marker>
      </defs>
      <polygon points={outline} fill="#0f172a" stroke="#1e293b" strokeWidth="1.5" />
      {[30, 35, 40, 45].map((la) => {
        const [, y] = project(la, LON0)
        return <line key={la} x1="0" x2={W} y1={y} y2={y} stroke="#1e293b" strokeDasharray="2 6" strokeWidth="0.6" />
      })}
      {[-120, -110, -100, -90, -80, -70].map((lo) => {
        const [x] = project(LAT0, lo)
        return <line key={lo} x1={x} x2={x} y1="0" y2={H} stroke="#1e293b" strokeDasharray="2 6" strokeWidth="0.6" />
      })}

      {/* open opportunities as faint origin→dest hints */}
      {open.slice(0, 40).map((s) => {
        const a = project(s.origin.latitude, s.origin.longitude)
        const b = project(s.destination.latitude, s.destination.longitude)
        const good = s.recommendation === 'accept' || s.recommendation === 'bid'
        return <path key={s.external_id} d={arc(a, b)} fill="none" stroke={good ? '#34d399' : '#475569'} strokeOpacity={good ? 0.35 : 0.18} strokeWidth="1" strokeDasharray="3 4" />
      })}
      {/* outstanding bids */}
      {bids.map((s) => {
        const a = project(s.origin.latitude, s.origin.longitude)
        const b = project(s.destination.latitude, s.destination.longitude)
        return <path key={s.external_id} d={arc(a, b)} fill="none" stroke="#a78bfa" strokeOpacity="0.6" strokeWidth="1.5" strokeDasharray="5 4" />
      })}
      {/* booked lanes */}
      {lanes.map((s) => {
        const a = project(s.origin.latitude, s.origin.longitude)
        const b = project(s.destination.latitude, s.destination.longitude)
        return <path key={s.external_id} d={arc(a, b)} fill="none" stroke="#38bdf8" strokeOpacity="0.8" strokeWidth="2" markerEnd="url(#arrow)" />
      })}

      {terminals.map((t) => {
        const [x, y] = project(t.latitude, t.longitude)
        const r = 10 + t.free_units * 1.6
        const color = t.level === 'critical' ? '#f43f5e' : t.level === 'warning' ? '#f59e0b' : '#38bdf8'
        const sel = selected === t.code
        return (
          <g key={t.code} className="cursor-pointer" onClick={() => onSelect(sel ? null : t.code)}>
            <circle cx={x} cy={y} r={r + 12} fill="url(#hubGlow)" />
            <circle cx={x} cy={y} r={r} fill="#0b1220" stroke={color} strokeWidth={sel ? 3 : 1.5} />
            <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="700" fill="#e2e8f0" fontFamily="ui-monospace, monospace">
              {t.code}
            </text>
            <text x={x} y={y + r + 12} textAnchor="middle" fontSize="10" fill="#94a3b8" fontFamily="ui-monospace, monospace">
              {t.free_units}/{t.usable_units} free{t.soft_locked_units ? ` · ${t.soft_locked_units} bid` : ''}
            </text>
          </g>
        )
      })}

      {moving.map((u) => {
        const [x, y] = project(u.latitude, u.longitude)
        const dead = u.phase === 'deadheading'
        return (
          <g key={u.id}>
            <title>
              {u.unit_number} · {u.phase} · {u.current_lock?.external_id} {u.current_lock?.lane_id}
            </title>
            <circle cx={x} cy={y} r="4.5" fill={dead ? '#f59e0b' : '#f8fafc'} stroke={dead ? '#78350f' : '#0ea5e9'} strokeWidth="1.5" />
          </g>
        )
      })}
      <g transform={`translate(12, ${H - 58})`} fontSize="10" fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">
        <rect x="-6" y="-12" width="190" height="56" rx="6" fill="#020617" opacity="0.75" />
        <line x1="0" x2="22" y1="0" y2="0" stroke="#38bdf8" strokeWidth="2" />
        <text x="28" y="3">booked lane · unit en route</text>
        <line x1="0" x2="22" y1="14" y2="14" stroke="#a78bfa" strokeWidth="1.5" strokeDasharray="5 4" />
        <text x="28" y="17">outstanding bid</text>
        <line x1="0" x2="22" y1="28" y2="28" stroke="#34d399" strokeWidth="1" strokeDasharray="3 4" />
        <text x="28" y="31">open load we'd take</text>
        <circle cx="11" cy="40" r="3.5" fill="#f59e0b" />
        <text x="28" y="43">deadheading to pickup</text>
      </g>
      {byCode && null}
    </svg>
  )
}

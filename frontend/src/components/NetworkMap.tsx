import { useMemo } from 'react'
import type { Shipment, TerminalRow, Unit } from '../types'

// Stylised outline of the contiguous US (lat, lon), enough to anchor the hubs on the atlas page.
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
const PAD = 18 // atlas margin carrying the grid coordinates

export function project(lat: number, lon: number): [number, number] {
  const x = PAD + ((lon - LON0) / (LON1 - LON0)) * (W - 2 * PAD)
  const y = PAD + ((LAT1 - lat) / (LAT1 - LAT0)) * (H - 2 * PAD)
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

const COLS = 'ABCDEFGHIJ'.split('')

export function NetworkMap({ terminals, units, active, open, selected, onSelect }: { terminals: TerminalRow[]; units: Unit[]; active: Shipment[]; open: Shipment[]; selected: string | null; onSelect: (code: string | null) => void }) {
  const outline = useMemo(() => OUTLINE.map(([la, lo]) => project(la, lo).join(',')).join(' '), [])
  const moving = units.filter((u) => u.phase === 'in_transit' || u.phase === 'deadheading')
  const lanes = active.filter((s) => s.status === 'accepted' || s.status === 'in_transit')
  const bids = active.filter((s) => s.status === 'bid_submitted')
  const cols = 10
  const rows = 6
  const cw = (W - 2 * PAD) / cols
  const rh = (H - 2 * PAD) / rows

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full select-none" role="img" aria-label="Atlas of terminals, booked lanes and moving units" fontFamily="Barlow Condensed, sans-serif">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-road)" />
        </marker>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-paper-4)" strokeWidth="1" />
        </pattern>
      </defs>

      {/* page, margin and coordinate grid */}
      <rect x="0" y="0" width={W} height={H} fill="var(--color-paper-2)" />
      <rect x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} fill="var(--color-paper)" stroke="var(--color-ink)" strokeWidth="1" />
      {Array.from({ length: cols + 1 }, (_, i) => (
        <line key={`c${i}`} x1={PAD + i * cw} x2={PAD + i * cw} y1={PAD} y2={H - PAD} stroke="var(--color-rule)" strokeWidth="0.6" />
      ))}
      {Array.from({ length: rows + 1 }, (_, i) => (
        <line key={`r${i}`} x1={PAD} x2={W - PAD} y1={PAD + i * rh} y2={PAD + i * rh} stroke="var(--color-rule)" strokeWidth="0.6" />
      ))}
      {COLS.map((c, i) => (
        <g key={c}>
          <text x={PAD + (i + 0.5) * cw} y={PAD - 5} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--color-ink-3)">
            {c}
          </text>
          <text x={PAD + (i + 0.5) * cw} y={H - PAD + 13} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--color-ink-3)">
            {c}
          </text>
        </g>
      ))}
      {Array.from({ length: rows }, (_, i) => (
        <g key={`n${i}`}>
          <text x={PAD - 6} y={PAD + (i + 0.5) * rh + 3} textAnchor="end" fontSize="10" fontWeight="600" fill="var(--color-ink-3)">
            {i + 1}
          </text>
          <text x={W - PAD + 6} y={PAD + (i + 0.5) * rh + 3} textAnchor="start" fontSize="10" fontWeight="600" fill="var(--color-ink-3)">
            {i + 1}
          </text>
        </g>
      ))}

      <polygon points={outline} fill="var(--color-paper-2)" stroke="var(--color-rule-2)" strokeWidth="1.2" strokeLinejoin="round" />

      {/* open opportunities: faint route hints */}
      {open.slice(0, 40).map((s) => {
        const a = project(s.origin.latitude, s.origin.longitude)
        const b = project(s.destination.latitude, s.destination.longitude)
        const good = s.recommendation === 'accept' || s.recommendation === 'bid'
        return <path key={s.external_id} d={arc(a, b)} fill="none" stroke={good ? 'var(--color-green)' : 'var(--color-rule-2)'} strokeOpacity={good ? 0.7 : 0.6} strokeWidth="1" strokeDasharray="2 4" />
      })}
      {/* outstanding bids */}
      {bids.map((s) => {
        const a = project(s.origin.latitude, s.origin.longitude)
        const b = project(s.destination.latitude, s.destination.longitude)
        return <path key={s.external_id} d={arc(a, b)} fill="none" stroke="var(--color-carbon)" strokeWidth="1.6" strokeDasharray="6 4" />
      })}
      {/* booked lanes, drawn as interstates: cased road */}
      {lanes.map((s) => {
        const a = project(s.origin.latitude, s.origin.longitude)
        const b = project(s.destination.latitude, s.destination.longitude)
        const d = arc(a, b)
        return (
          <g key={s.external_id}>
            <path d={d} fill="none" stroke="var(--color-paper-2)" strokeWidth="5" />
            <path d={d} fill="none" stroke="var(--color-road)" strokeWidth="2.4" markerEnd="url(#arrow)" />
          </g>
        )
      })}

      {terminals.map((t) => {
        const [x, y] = project(t.latitude, t.longitude)
        const r = 9 + t.free_units * 1.4
        const stroke = t.level === 'critical' ? 'var(--color-red)' : t.level === 'warning' ? 'var(--color-yellow-ink)' : 'var(--color-ink)'
        const sel = selected === t.code
        return (
          <g key={t.code} className="cursor-pointer" onClick={() => onSelect(sel ? null : t.code)}>
            <title>{`${t.name}: ${t.free_units} free of ${t.usable_units} usable · ${t.open_loads_from_here} open loads from here`}</title>
            {sel && <circle cx={x} cy={y} r={r + 6} fill="none" stroke="var(--color-road)" strokeWidth="1.5" strokeDasharray="3 3" />}
            <circle cx={x} cy={y} r={r} fill={t.level === 'critical' ? 'var(--color-red-soft)' : t.level === 'warning' ? 'var(--color-yellow-soft)' : 'var(--color-paper-2)'} stroke={stroke} strokeWidth={sel ? 2.4 : 1.6} />
            <circle cx={x} cy={y} r={2.2} fill="var(--color-ink)" />
            <text x={x} y={y - r - 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--color-ink)" letterSpacing="0.5">
              {t.code}
            </text>
            <text x={x} y={y + r + 12} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="var(--color-ink-2)" letterSpacing="0.3">
              {t.free_units}/{t.usable_units} free{t.soft_locked_units ? ` · ${t.soft_locked_units} bid` : ''}
            </text>
          </g>
        )
      })}

      {moving.map((u) => {
        const [x, y] = project(u.latitude, u.longitude)
        const dead = u.phase === 'deadheading'
        return (
          <g key={u.id} transform={`translate(${x} ${y})`}>
            <title>{`${u.unit_number} · ${u.phase.replace('_', ' ')} · ${u.current_lock?.external_id} ${u.current_lock?.lane_id}`}</title>
            <rect x="-5" y="-3.5" width="10" height="7" rx="1" fill={dead ? 'var(--color-yellow)' : 'var(--color-ink)'} stroke="var(--color-paper-2)" strokeWidth="1.2" />
          </g>
        )
      })}

      {/* legend box */}
      <g transform={`translate(${PAD + 10}, ${H - PAD - 74})`} fontSize="10.5" fontWeight="600" fill="var(--color-ink-2)">
        <rect x="0" y="0" width="178" height="64" fill="var(--color-paper-2)" stroke="var(--color-ink)" strokeWidth="1" />
        <text x="8" y="12" fontSize="10" fontWeight="700" letterSpacing="1" fill="var(--color-ink)">
          LEGEND
        </text>
        <line x1="8" x2="30" y1="24" y2="24" stroke="var(--color-road)" strokeWidth="2.4" />
        <text x="36" y="27">booked lane · unit en route</text>
        <line x1="8" x2="30" y1="36" y2="36" stroke="var(--color-carbon)" strokeWidth="1.6" strokeDasharray="6 4" />
        <text x="36" y="39">outstanding bid</text>
        <line x1="8" x2="30" y1="48" y2="48" stroke="var(--color-green)" strokeWidth="1" strokeDasharray="2 4" />
        <text x="36" y="51">open load worth taking</text>
        <rect x="14" y="56.5" width="10" height="6" rx="1" fill="var(--color-yellow)" stroke="var(--color-ink)" strokeWidth="0.6" />
        <text x="36" y="62.5">empty move to pickup</text>
      </g>
    </svg>
  )
}

export const money = (v: number | null | undefined, digits = 0) =>
  v == null ? '—' : (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })

export const pct = (v: number | null | undefined, digits = 1) => (v == null ? '—' : `${(v * 100).toFixed(digits)}%`)

export const miles = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v).toLocaleString()} mi`)

export const lbs = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v).toLocaleString()} lb`)

export const parseTs = (s: string | null | undefined): number => (s ? Date.parse(s.endsWith('Z') ? s : s + 'Z') : NaN)

export function fmtSim(s: string | null | undefined, opts: { date?: boolean } = {}): string {
  if (!s) return '—'
  const d = new Date(parseTs(s))
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
  if (!opts.date) return time
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `${date} ${time}`
}

export function fmtSimFull(s: string | null | undefined): string {
  if (!s) return '—'
  const d = new Date(parseTs(s))
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC'
}

export function countdown(seconds: number): string {
  if (seconds <= 0) return 'expired'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function relHours(fromMs: number, toMs: number): string {
  const h = (toMs - fromMs) / 3.6e6
  if (Math.abs(h) < 1) return `${Math.round(h * 60)}m`
  if (Math.abs(h) < 48) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}d`
}

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

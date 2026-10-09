import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { Schedule, TerminalRow } from '../types'
import { cx, fmtSim, money, parseTs } from '../lib/format'
import { Panel } from './ui'
import { Seg } from './LoadBoard'

export function SchedulePanel({ simNow, terminals, refreshKey }: { simNow: number; terminals: TerminalRow[]; refreshKey: string | number }) {
  const [data, setData] = useState<Schedule | null>(null)
  const [hub, setHub] = useState<string>('ALL')
  const [showIdle, setShowIdle] = useState(false)
  const [span, setSpan] = useState<'24' | '48' | '96'>('48')

  useEffect(() => {
    let alive = true
    api.schedule(6, Number(span)).then((d) => alive && setData(d)).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [refreshKey, span])

  const from = useMemo(() => simNow - 6 * 3.6e6, [simNow])
  const to = useMemo(() => simNow + Number(span) * 3.6e6, [simNow, span])
  const x = (ms: number) => ((ms - from) / (to - from)) * 100

  const rows = (data?.units ?? []).filter((u) => (hub === 'ALL' || u.home_terminal_code === hub) && (showIdle || u.locks.some((l) => l.status === 'active')))
  const hours: number[] = []
  const step = span === '96' ? 12 : span === '48' ? 6 : 3
  for (let h = -6; h <= Number(span); h += step) hours.push(h)

  return (
    <Panel
      title="Schedule timeline"
      subtitle="Each bar is a temporal lock: amber = empty move to pickup, blue = loaded, grey = turnaround buffer, dashed = outstanding bid (soft lock)"
      right={
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select value={hub} onChange={(e) => setHub(e.target.value)} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200">
            <option value="ALL">All hubs</option>
            {terminals.map((t) => (
              <option key={t.code} value={t.code}>
                {t.code}
              </option>
            ))}
          </select>
          <Seg value={span} onChange={setSpan} options={[['24', '24h'], ['48', '48h'], ['96', '96h']]} />
          <label className="flex items-center gap-1 text-slate-400">
            <input type="checkbox" checked={showIdle} onChange={(e) => setShowIdle(e.target.checked)} className="accent-sky-500" /> idle units
          </label>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="relative ml-40 h-5 border-b border-slate-800 text-[10px] text-slate-500">
            {hours.map((h) => (
              <span key={h} className="absolute -translate-x-1/2" style={{ left: `${x(simNow + h * 3.6e6)}%` }}>
                {h === 0 ? 'now' : `${h > 0 ? '+' : ''}${h}h`}
              </span>
            ))}
          </div>
          {rows.length === 0 && <div className="py-8 text-center text-sm text-slate-500">No locks in this window{hub !== 'ALL' ? ` for ${hub}` : ''}. Book a load to see its lock here.</div>}
          {rows.map((u) => (
            <div key={u.id} className="flex items-center border-b border-slate-800/60 py-1">
              <div className="w-40 shrink-0 pr-2 text-xs">
                <div className="font-mono text-slate-200">{u.unit_number}</div>
                <div className="truncate text-[10px] text-slate-500">
                  {u.driver_name} · {u.home_terminal_code}
                </div>
              </div>
              <div className="relative h-7 flex-1 rounded bg-slate-950/60">
                <div className="absolute inset-y-0 w-px bg-rose-400/70" style={{ left: `${x(simNow)}%` }} />
                {u.locks
                  .filter((l) => l.status === 'active')
                  .map((l) => {
                    const s = parseTs(l.starts_at)
                    const p = parseTs(l.pickup_at)
                    const d = parseTs(l.delivery_at)
                    const e = parseTs(l.ends_at)
                    const soft = l.kind === 'soft'
                    const clamp = (v: number) => Math.max(0, Math.min(100, v))
                    const xs = clamp(x(s))
                    const xp = clamp(x(p))
                    const xd = clamp(x(d))
                    const xe = clamp(x(e))
                    if (xe - xs <= 0) return null
                    const title = `${l.external_id} ${l.lane_id}\n${l.origin_city} → ${l.destination_city}\ndepart ${fmtSim(l.depart_at, { date: true })} · pickup ${fmtSim(l.pickup_at, { date: true })} · deliver ${fmtSim(l.delivery_at, { date: true })}\n${Math.round(l.deadhead_miles)} mi empty · payout ${money(l.payout)} · margin ${money(l.margin)}${soft ? '\n(soft lock: outstanding bid)' : ''}`
                    return (
                      <div key={l.id} className="group absolute inset-y-1" style={{ left: `${xs}%`, width: `${Math.max(0.3, xe - xs)}%` }} title={title}>
                        {xp > xs && <div className={cx('absolute inset-y-0 rounded-l', soft ? 'border border-dashed border-amber-400/70' : 'bg-amber-500/70')} style={{ left: 0, width: `${((xp - xs) / (xe - xs)) * 100}%` }} />}
                        {xd > xp && <div className={cx('absolute inset-y-0', soft ? 'border border-dashed border-violet-400/80 bg-violet-500/10' : 'bg-sky-500/80')} style={{ left: `${((xp - xs) / (xe - xs)) * 100}%`, width: `${((xd - xp) / (xe - xs)) * 100}%` }} />}
                        {xe > xd && <div className={cx('absolute inset-y-0 rounded-r', soft ? 'border border-dashed border-slate-500/70' : 'bg-slate-600/70')} style={{ left: `${((xd - xs) / (xe - xs)) * 100}%`, width: `${((xe - xd) / (xe - xs)) * 100}%` }} />}
                        <div className="pointer-events-none absolute inset-0 flex items-center overflow-hidden px-1 font-mono text-[10px] text-white/90">
                          <span className="truncate">{l.lane_id}</span>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  )
}

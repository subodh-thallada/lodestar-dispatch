import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { Schedule, TerminalRow } from '../types'
import { cx, fmtSim, money, parseTs } from '../lib/format'
import { Empty, Panel, Seg } from './ui'

export function SchedulePanel({ simNow, terminals, refreshKey }: { simNow: number; terminals: TerminalRow[]; refreshKey: string | number }) {
  const [data, setData] = useState<Schedule | null>(null)
  const [hub, setHub] = useState<string>('ALL')
  const [showIdle, setShowIdle] = useState(false)
  const [span, setSpan] = useState<'24' | '48' | '96'>('48')

  useEffect(() => {
    let alive = true
    api
      .schedule(6, Number(span))
      .then((d) => alive && setData(d))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [refreshKey, span])

  const from = useMemo(() => simNow - 6 * 3.6e6, [simNow])
  const to = useMemo(() => simNow + Number(span) * 3.6e6, [simNow, span])
  const x = (ms: number) => ((ms - from) / (to - from)) * 100
  const clamp = (v: number) => Math.max(0, Math.min(100, v))

  const rows = (data?.units ?? []).filter((u) => (hub === 'ALL' || u.home_terminal_code === hub) && (showIdle || u.locks.some((l) => l.status === 'active')))
  const hours: number[] = []
  const step = span === '96' ? 12 : span === '48' ? 6 : 3
  for (let h = -6; h <= Number(span); h += step) hours.push(h)

  return (
    <Panel
      title="Driver's log"
      subtitle="Each bar is a temporal lock. Yellow = empty move to pickup, blue = loaded, grey = turnaround, dashed = soft lock from an outstanding bid."
      right={
        <div className="flex flex-wrap items-center gap-2">
          <select value={hub} onChange={(e) => setHub(e.target.value)} className="h-7 rounded-[3px] border border-rule-2 bg-paper px-2 font-condensed text-[12px] font-semibold uppercase tracking-[0.06em] text-ink" aria-label="filter by hub">
            <option value="ALL">All hubs</option>
            {terminals.map((t) => (
              <option key={t.code} value={t.code}>
                {t.code}
              </option>
            ))}
          </select>
          <Seg value={span} onChange={setSpan} options={[['24', '24h'], ['48', '48h'], ['96', '96h']]} />
          <label className="flex items-center gap-1.5 font-condensed text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-2">
            <input type="checkbox" checked={showIdle} onChange={(e) => setShowIdle(e.target.checked)} /> idle units
          </label>
        </div>
      }
      bodyClassName="p-0"
    >
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="relative ml-44 mr-3 h-6 border-b border-rule">
            {hours.map((h) => (
              <span key={h} className={cx('label absolute top-1.5 -translate-x-1/2', h === 0 ? 'text-red-ink' : '')} style={{ left: `${x(simNow + h * 3.6e6)}%` }}>
                {h === 0 ? 'now' : `${h > 0 ? '+' : ''}${h}h`}
              </span>
            ))}
          </div>
          {rows.length === 0 && (
            <div className="p-4">
              <Empty hint="Accept a load and its lock appears here as a bar from departure to turnaround.">{`No locks in this window${hub !== 'ALL' ? ` for ${hub}` : ''}.`}</Empty>
            </div>
          )}
          {rows.map((u) => (
            <div key={u.id} className="flex items-stretch border-b border-rule/70">
              <div className="w-44 shrink-0 border-r border-rule py-1.5 pl-3 pr-2">
                <div className="font-condensed text-[14px] font-bold uppercase tracking-[0.06em] text-ink">{u.unit_number}</div>
                <div className="truncate text-[11px] text-ink-3">
                  {u.driver_name} · {u.home_terminal_code}
                </div>
              </div>
              <div className="relative my-1.5 mr-3 h-8 flex-1" style={{ backgroundImage: `repeating-linear-gradient(to right, var(--color-rule) 0, var(--color-rule) 1px, transparent 1px, transparent ${(100 / ((Number(span) + 6) / step)).toFixed(3)}%)` }}>
                <div className="absolute inset-y-0 z-10 w-px bg-red" style={{ left: `${x(simNow)}%` }} />
                {u.locks
                  .filter((l) => l.status === 'active')
                  .map((l) => {
                    const xs = clamp(x(parseTs(l.starts_at)))
                    const xp = clamp(x(parseTs(l.pickup_at)))
                    const xd = clamp(x(parseTs(l.delivery_at)))
                    const xe = clamp(x(parseTs(l.ends_at)))
                    if (xe - xs <= 0) return null
                    const soft = l.kind === 'soft'
                    const title = `${l.external_id} ${l.lane_id}\n${l.origin_city} → ${l.destination_city}\ndepart ${fmtSim(l.depart_at, { date: true })} · pickup ${fmtSim(l.pickup_at, { date: true })} · deliver ${fmtSim(l.delivery_at, { date: true })}\n${Math.round(l.deadhead_miles)} mi empty · payout ${money(l.payout)} · margin ${money(l.margin)}${soft ? '\n(soft lock: outstanding bid)' : ''}`
                    const w = xe - xs
                    return (
                      <div key={l.id} className="absolute inset-y-0.5" style={{ left: `${xs}%`, width: `${Math.max(0.3, w)}%` }} title={title}>
                        {xp > xs && <div className={cx('absolute inset-y-0', soft ? 'border border-dashed border-yellow-ink' : 'bg-yellow')} style={{ left: 0, width: `${((xp - xs) / w) * 100}%` }} />}
                        {xd > xp && <div className={cx('absolute inset-y-0', soft ? 'border border-dashed border-carbon bg-carbon-soft/40' : 'bg-road')} style={{ left: `${((xp - xs) / w) * 100}%`, width: `${((xd - xp) / w) * 100}%` }} />}
                        {xe > xd && <div className={cx('absolute inset-y-0', soft ? 'border border-dashed border-rule-2' : 'bg-paper-4')} style={{ left: `${((xd - xs) / w) * 100}%`, width: `${((xe - xd) / w) * 100}%` }} />}
                        <div className={cx('pointer-events-none absolute inset-0 flex items-center overflow-hidden px-1.5 font-condensed text-[12px] font-bold uppercase tracking-[0.06em]', soft ? 'text-carbon-ink' : 'text-paper-2')}>
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

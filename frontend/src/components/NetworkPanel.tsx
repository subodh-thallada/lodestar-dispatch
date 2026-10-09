import { useState } from 'react'
import { AlertTriangle, Info, OctagonAlert } from 'lucide-react'
import type { Forecast, Shipment, TerminalRow, Unit } from '../types'
import { cx, pct } from '../lib/format'
import { Badge, Bar, Panel } from './ui'
import { NetworkMap } from './NetworkMap'

export function NetworkPanel({ terminals, units, forecast, active, open }: { terminals: TerminalRow[]; units: Unit[]; forecast: Forecast | null; active: Shipment[]; open: Shipment[] }) {
  const [selected, setSelected] = useState<string | null>(null)
  const sel = terminals.find((t) => t.code === selected) ?? null
  const selUnits = sel ? units.filter((u) => u.home_terminal_code === sel.code) : []
  const warnings = forecast?.warnings ?? []

  return (
    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <Panel title="Network" subtitle="Hubs sized by free capacity · click a hub for its roster" className="xl:row-span-2">
        <NetworkMap terminals={terminals} units={units} active={active} open={open} selected={selected} onSelect={setSelected} />
      </Panel>

      <Panel title="Capacity warnings" subtitle="From the lock-aware forecast (capacity follows the freight)">
        {warnings.length === 0 ? (
          <div className="text-sm text-slate-500">No warnings — every hub is above its reserve for the next 24 sim hours.</div>
        ) : (
          <ul className="space-y-1.5">
            {warnings.map((w, i) => (
              <li key={i} className={cx('flex items-start gap-2 rounded-md px-2 py-1.5 text-xs', w.level === 'critical' ? 'bg-rose-500/10 text-rose-200' : w.level === 'warning' ? 'bg-amber-500/10 text-amber-200' : 'bg-sky-500/10 text-sky-200')}>
                {w.level === 'critical' ? <OctagonAlert size={14} className="mt-0.5 shrink-0" /> : w.level === 'warning' ? <AlertTriangle size={14} className="mt-0.5 shrink-0" /> : <Info size={14} className="mt-0.5 shrink-0" />}
                <span>{w.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Terminal utilization" subtitle="busy = hard-locked now · bid = soft-locked by outstanding bids · next = committed to a later pickup">
        <div className="grid gap-2 sm:grid-cols-2">
          {terminals.map((t) => {
            const fc = forecast?.terminals[t.code] ?? []
            return (
              <button key={t.code} onClick={() => setSelected(selected === t.code ? null : t.code)} className={cx('rounded-lg border px-3 py-2 text-left transition hover:bg-slate-800/50', selected === t.code ? 'border-sky-500/60 bg-slate-800/60' : 'border-slate-800')}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-100">{t.code}</span>
                    <span className="text-xs text-slate-400">{t.city}</span>
                  </div>
                  <Badge tone={t.level === 'critical' ? 'bad' : t.level === 'warning' ? 'warn' : 'good'}>
                    {t.free_units} free
                  </Badge>
                </div>
                <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded bg-slate-800" title={`${t.busy_units} busy · ${t.soft_locked_units} bid · ${t.committed_units} next · ${t.free_units} free · ${t.out_of_service} out`}>
                  <div className="bg-sky-500" style={{ width: `${(t.busy_units / Math.max(t.total_units, 1)) * 100}%` }} />
                  <div className="bg-violet-500" style={{ width: `${(t.soft_locked_units / Math.max(t.total_units, 1)) * 100}%` }} />
                  <div className="bg-amber-500/70" style={{ width: `${(t.committed_units / Math.max(t.total_units, 1)) * 100}%` }} />
                  <div className="bg-emerald-500/70" style={{ width: `${(t.free_units / Math.max(t.total_units, 1)) * 100}%` }} />
                  <div className="bg-slate-600" style={{ width: `${(t.out_of_service / Math.max(t.total_units, 1)) * 100}%` }} />
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                  <span>
                    util {pct(t.utilization, 0)} · {t.open_loads_from_here} open from here
                  </span>
                  <span className="font-mono">
                    {fc.map((p) => p.free).join(' › ')}
                    <span className="ml-1 text-slate-600">free @0/2/6/12/24h</span>
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </Panel>

      {sel && (
        <Panel title={`${sel.code} roster · ${sel.name}`} subtitle={`${sel.usable_units} usable units · reserve ${sel.reserve}`} className="xl:col-span-2" right={<button onClick={() => setSelected(null)} className="text-xs text-slate-400 hover:text-slate-200">close</button>}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {selUnits.map((u) => (
              <div key={u.id} className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold text-slate-100">{u.unit_number}</span>
                  <Badge tone={u.phase === 'idle' ? 'good' : u.phase === 'in_transit' || u.phase === 'deadheading' ? 'info' : u.phase === 'bid_pending' ? 'accent' : u.phase === 'maintenance' ? 'neutral' : 'warn'}>{u.phase.replace('_', ' ')}</Badge>
                </div>
                <div className="text-slate-400">{u.driver_name}</div>
                {u.current_lock && (
                  <div className="mt-1 text-[11px] text-slate-300">
                    {u.current_lock.external_id} · {u.current_lock.lane_id}
                    {u.progress != null && <Bar value={u.progress} max={1} className="mt-1" />}
                  </div>
                )}
                {u.upcoming_locks.length > 0 && <div className="mt-1 text-[11px] text-amber-300">next: {u.upcoming_locks[0].external_id}</div>}
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}

import { useState } from 'react'
import { AlertTriangle, Info, OctagonAlert, X } from 'lucide-react'
import type { Forecast, Shipment, TerminalRow, Unit } from '../types'
import { cx, pct } from '../lib/format'
import { Bar, Panel, Tag, Th, type Tone } from './ui'
import { NetworkMap } from './NetworkMap'

const phaseTone: Record<string, Tone> = { idle: 'good', in_transit: 'info', deadheading: 'warn', turnaround: 'neutral', bid_pending: 'accent', committed: 'warn', maintenance: 'neutral', off_duty: 'neutral' }

export function NetworkPanel({ terminals, units, forecast, active, open }: { terminals: TerminalRow[]; units: Unit[]; forecast: Forecast | null; active: Shipment[]; open: Shipment[] }) {
  const [selected, setSelected] = useState<string | null>(null)
  const sel = terminals.find((t) => t.code === selected) ?? null
  const selUnits = sel ? units.filter((u) => u.home_terminal_code === sel.code) : []
  const warnings = forecast?.warnings ?? []

  return (
    <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
      <Panel title="Network" subtitle="Hubs sized by free units. Click a hub for its roster." className="xl:row-span-2" bodyClassName="p-2">
        <NetworkMap terminals={terminals} units={units} active={active} open={open} selected={selected} onSelect={setSelected} />
      </Panel>

      <Panel title="Road conditions" subtitle="From the lock-aware forecast: capacity follows the freight." bodyClassName="p-3">
        {warnings.length === 0 ? (
          <p className="text-sm text-ink-2">Clear. Every hub stays above its reserve for the next 24 sim hours.</p>
        ) : (
          <ul className="divide-y divide-rule">
            {warnings.map((w, i) => (
              <li key={i} className={cx('flex items-start gap-2 py-2 text-[13px] leading-snug', w.level === 'critical' ? 'text-red-ink' : w.level === 'warning' ? 'text-yellow-ink' : 'text-road-ink')}>
                {w.level === 'critical' ? <OctagonAlert size={15} className="mt-0.5 shrink-0" /> : w.level === 'warning' ? <AlertTriangle size={15} className="mt-0.5 shrink-0" /> : <Info size={15} className="mt-0.5 shrink-0" />}
                <span className="text-ink-2">{w.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Terminal utilization" subtitle="busy = hard-locked now · bid = soft-locked by outstanding bids · next = committed to a later pickup" bodyClassName="p-0">
        <table className="num w-full text-left text-[13px]">
          <thead className="border-b border-rule">
            <tr>
              <Th className="pl-3">Hub</Th>
              <Th>Units</Th>
              <Th right>Free</Th>
              <Th right>Util</Th>
              <Th right>Open</Th>
              <Th className="pr-3" right>
                Free @0·2·6·12·24h
              </Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule/70">
            {terminals.map((t) => {
              const fc = forecast?.terminals[t.code] ?? []
              const total = Math.max(t.total_units, 1)
              const on = selected === t.code
              return (
                <tr key={t.code} onClick={() => setSelected(on ? null : t.code)} className={cx('cursor-pointer transition-colors duration-150 hover:bg-paper', on && 'bg-road-soft/50')}>
                  <td className="py-2 pl-3 pr-3">
                    <div className="font-condensed text-[15px] font-bold uppercase tracking-[0.06em] text-ink">{t.code}</div>
                    <div className="text-[11px] text-ink-3">{t.city}</div>
                  </td>
                  <td className="py-2 pr-3 align-middle">
                    <div className="flex h-2 w-28 overflow-hidden bg-paper-3" title={`${t.busy_units} busy · ${t.soft_locked_units} bid · ${t.committed_units} next · ${t.free_units} free · ${t.out_of_service} out of service`}>
                      <div className="bg-road" style={{ width: `${(t.busy_units / total) * 100}%` }} />
                      <div className="bg-carbon" style={{ width: `${(t.soft_locked_units / total) * 100}%` }} />
                      <div className="bg-yellow" style={{ width: `${(t.committed_units / total) * 100}%` }} />
                      <div className="bg-green/70" style={{ width: `${(t.free_units / total) * 100}%` }} />
                      <div className="bg-paper-4" style={{ width: `${(t.out_of_service / total) * 100}%` }} />
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <Tag tone={t.level === 'critical' ? 'bad' : t.level === 'warning' ? 'warn' : 'good'}>{t.free_units} free</Tag>
                  </td>
                  <td className="py-2 pr-3 text-right text-ink-2">{pct(t.utilization, 0)}</td>
                  <td className="py-2 pr-3 text-right text-ink-2">{t.open_loads_from_here}</td>
                  <td className="py-2 pr-3 text-right font-condensed text-[13px] font-semibold tracking-[0.1em] text-ink-2">{fc.map((p) => p.free).join('·')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Panel>

      {sel && (
        <Panel title={`${sel.code} roster · ${sel.name}`} subtitle={`${sel.usable_units} usable units · reserve ${sel.reserve}`} className="xl:col-span-2" right={<button onClick={() => setSelected(null)} className="inline-flex items-center gap-1 font-condensed text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3 hover:text-ink"><X size={12} /> close</button>} bodyClassName="p-0">
          <table className="num w-full text-left text-[13px]">
            <thead className="border-b border-rule">
              <tr>
                <Th className="pl-3">Unit</Th>
                <Th>Driver</Th>
                <Th>Phase</Th>
                <Th>Current load</Th>
                <Th>Progress</Th>
                <Th className="pr-3">Next</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/70">
              {selUnits.map((u) => (
                <tr key={u.id}>
                  <td className="py-2 pl-3 pr-3 font-condensed text-[14px] font-bold uppercase tracking-[0.06em]">{u.unit_number}</td>
                  <td className="py-2 pr-3 text-ink-2">{u.driver_name}</td>
                  <td className="py-2 pr-3">
                    <Tag tone={phaseTone[u.phase] ?? 'neutral'}>{u.phase.replace('_', ' ')}</Tag>
                  </td>
                  <td className="py-2 pr-3 font-condensed text-[13px] font-semibold uppercase tracking-[0.04em] text-ink-2">{u.current_lock ? `${u.current_lock.external_id} · ${u.current_lock.lane_id}` : '—'}</td>
                  <td className="py-2 pr-3">{u.progress != null ? <Bar value={u.progress} max={1} tone={u.phase === 'deadheading' ? 'warn' : 'info'} className="w-24" /> : <span className="text-ink-3">—</span>}</td>
                  <td className="py-2 pr-3 font-condensed text-[13px] font-semibold uppercase tracking-[0.04em] text-yellow-ink">{u.upcoming_locks[0]?.external_id ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  )
}

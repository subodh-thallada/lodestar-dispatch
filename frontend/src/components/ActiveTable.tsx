import { useState } from 'react'
import type { Shipment } from '../types'
import { fmtSim, miles, money, parseTs, pct, relHours } from '../lib/format'
import { Badge, Empty, Panel, type Tone } from './ui'
import { Seg } from './LoadBoard'

const statusTone: Record<string, Tone> = {
  accepted: 'good',
  in_transit: 'info',
  bid_submitted: 'accent',
  completed: 'neutral',
  bid_lost: 'bad',
  declined: 'neutral',
  expired: 'neutral',
  gone: 'neutral',
}

export function ActiveTable({ active, history, simNow }: { active: Shipment[]; history: Shipment[]; simNow: number }) {
  const [view, setView] = useState<'active' | 'history'>('active')
  const rows = view === 'active' ? active : history.filter((s) => s.booked_by || s.status === 'completed' || s.status === 'declined' || s.status === 'bid_lost').slice(0, 60)
  return (
    <Panel
      title="Booked & pending"
      subtitle={view === 'active' ? 'Loads we own: awarded bids, units en route, outstanding bids' : 'Completed deliveries, declined offers, lost bids'}
      right={<Seg value={view} onChange={setView} options={[['active', `Active ${active.length}`], ['history', 'History']]} />}
    >
      {rows.length === 0 ? (
        <Empty>{view === 'active' ? 'Nothing booked yet. Accept a load or submit a bid to see it here.' : 'No history yet.'}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-1 pr-3">Load</th>
                <th className="py-1 pr-3">Lane</th>
                <th className="py-1 pr-3">Status</th>
                <th className="py-1 pr-3">Unit</th>
                <th className="py-1 pr-3 text-right">Payout</th>
                <th className="py-1 pr-3 text-right">Deadhead</th>
                <th className="py-1 pr-3 text-right">Margin</th>
                <th className="py-1 pr-3">Pickup</th>
                <th className="py-1 pr-3">Delivery</th>
                <th className="py-1 pr-3">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {rows.map((s) => {
                const payout = s.payout ?? s.our_bid_rate ?? s.offered_rate
                const m = s.booked_margin ?? (s.status === 'bid_submitted' && s.our_bid_rate && s.evaluation ? s.our_bid_rate - s.evaluation.total_cost : null)
                return (
                  <tr key={s.external_id} className="hover:bg-slate-800/40">
                    <td className="py-1.5 pr-3 font-mono text-slate-300">{s.external_id}</td>
                    <td className="py-1.5 pr-3">
                      <div className="font-mono text-slate-200">{s.lane_id}</div>
                      <div className="text-[10px] text-slate-500">{miles(s.distance_miles)}</div>
                    </td>
                    <td className="py-1.5 pr-3">
                      <Badge tone={statusTone[s.status] ?? 'neutral'}>{s.status.replace('_', ' ')}</Badge>
                      {s.status === 'bid_submitted' && s.bid_decision_at && <div className="mt-0.5 text-[10px] text-slate-500">decision in {relHours(simNow, parseTs(s.bid_decision_at))}</div>}
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-slate-300">{s.assigned_unit_number ?? '—'}</td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-slate-200">{money(payout)}</td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-slate-400">{s.booked_deadhead_miles != null ? `${Math.round(s.booked_deadhead_miles)} mi` : '—'}</td>
                    <td className={`py-1.5 pr-3 text-right font-mono tabular-nums ${m == null ? 'text-slate-500' : m < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                      {money(m)}
                      {m != null && payout ? <span className="ml-1 text-[10px] text-slate-500">{pct(m / payout, 0)}</span> : null}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-400">{fmtSim(s.pickup_at, { date: true })}</td>
                    <td className="py-1.5 pr-3 text-slate-400">{fmtSim(s.delivery_at, { date: true })}</td>
                    <td className="py-1.5 pr-3">
                      {s.booked_by && <Badge tone={s.booked_by === 'autopilot' ? 'accent' : 'neutral'}>{s.booked_by}</Badge>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

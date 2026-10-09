import { useState } from 'react'
import type { Shipment } from '../types'
import { cx, fmtSim, miles, money, parseTs, pct, relHours } from '../lib/format'
import { Empty, Panel, Seg, Tag, Th, type Tone } from './ui'

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
      subtitle={view === 'active' ? 'Loads we own: awarded bids, units en route, outstanding bids.' : 'Completed deliveries, declined offers, lost bids. Nothing disappears; it cancels.'}
      right={<Seg value={view} onChange={setView} options={[['active', `Active ${active.length}`], ['history', 'History']]} />}
      bodyClassName="p-0"
    >
      {rows.length === 0 ? (
        <div className="p-4">
          <Empty hint="Accept a load or submit a bid and it lands here with its unit and margin.">{view === 'active' ? 'Nothing booked yet.' : 'No history yet.'}</Empty>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="num w-full text-left text-[13px]">
            <thead className="border-b border-rule">
              <tr>
                <Th className="pl-4">Load</Th>
                <Th>Lane</Th>
                <Th>Status</Th>
                <Th>Unit</Th>
                <Th right>Payout</Th>
                <Th right>Empty</Th>
                <Th right>Margin</Th>
                <Th>Pickup</Th>
                <Th>Delivery</Th>
                <Th>By</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/70">
              {rows.map((s) => {
                const payout = s.payout ?? s.our_bid_rate ?? s.offered_rate
                const m = s.booked_margin ?? (s.status === 'bid_submitted' && s.our_bid_rate && s.evaluation ? s.our_bid_rate - s.evaluation.total_cost : null)
                const dim = view === 'history'
                return (
                  <tr key={s.external_id} className={cx('transition-colors duration-150 hover:bg-paper', dim && 'text-ink-3')}>
                    <td className="py-2 pl-4 pr-3 font-condensed text-[14px] font-semibold uppercase tracking-[0.04em]">{s.external_id}</td>
                    <td className="py-2 pr-3">
                      <div className="font-condensed text-[14px] font-semibold uppercase tracking-[0.04em]">{s.lane_id}</div>
                      <div className="text-[11px] text-ink-3">{miles(s.distance_miles)}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <Tag tone={statusTone[s.status] ?? 'neutral'}>{s.status.replace('_', ' ')}</Tag>
                      {s.status === 'bid_submitted' && s.bid_decision_at && <div className="mt-0.5 text-[11px] text-ink-3">award in {relHours(simNow, parseTs(s.bid_decision_at))}</div>}
                    </td>
                    <td className="py-2 pr-3 font-condensed text-[14px] font-semibold uppercase tracking-[0.04em]">{s.assigned_unit_number ?? '—'}</td>
                    <td className="py-2 pr-3 text-right">{money(payout)}</td>
                    <td className="py-2 pr-3 text-right text-ink-3">{s.booked_deadhead_miles != null ? `${Math.round(s.booked_deadhead_miles)} mi` : '—'}</td>
                    <td className={cx('py-2 pr-3 text-right font-semibold', m == null ? 'text-ink-3' : m < 0 ? 'text-red-ink' : dim ? '' : 'text-green-ink')}>
                      {money(m)}
                      {m != null && payout ? <span className="ml-1 text-[11px] font-normal text-ink-3">{pct(m / payout, 0)}</span> : null}
                    </td>
                    <td className="py-2 pr-3 text-ink-2">{fmtSim(s.pickup_at, { date: true })}</td>
                    <td className="py-2 pr-3 text-ink-2">{fmtSim(s.delivery_at, { date: true })}</td>
                    <td className="py-2 pr-4">{s.booked_by && <Tag tone={s.booked_by === 'autopilot' ? 'accent' : 'neutral'}>{s.booked_by}</Tag>}</td>
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

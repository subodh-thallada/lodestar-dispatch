import { useState } from 'react'
import type { Shipment } from '../types'
import { Empty, Panel, Seg, Shield } from './ui'
import { LoadCard, useSorted } from './LoadCard'
import { ActiveTable } from './ActiveTable'

type Filter = 'all' | 'recommended' | 'hold' | 'pass'

export function LoadBoard({ open, active, history, simNow, onChanged }: { open: Shipment[]; active: Shipment[]; history: Shipment[]; simNow: number; onChanged: () => void }) {
  const [sort, setSort] = useState<'score' | 'expiry' | 'margin'>('score')
  const [filter, setFilter] = useState<Filter>('all')
  const sorted = useSorted(open, sort)
  const keep = (s: Shipment) => {
    const r = s.recommendation
    if (filter === 'recommended') return r === 'accept' || r === 'bid'
    if (filter === 'hold') return r === 'hold'
    if (filter === 'pass') return r === 'decline' || r === 'skip'
    return true
  }
  const fixed = sorted.filter((s) => s.order_type === 'fixed_rate' && keep(s))
  const bids = sorted.filter((s) => s.order_type === 'open_bid' && keep(s))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label">Show</span>
        <Seg value={filter} onChange={setFilter} options={[['all', 'All'], ['recommended', 'Recommended'], ['hold', 'Hold'], ['pass', 'Pass']]} />
        <span className="label ml-2">Order by</span>
        <Seg value={sort} onChange={setSort} options={[['score', 'Score'], ['margin', 'Margin'], ['expiry', 'Expiry']]} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <Shield kind="bin" className="h-[22px] w-[25px]" /> Book-It-Now <span className="num text-ink-3">{fixed.length}</span>
            </span>
          }
          subtitle="Fixed-rate offers. Accept before the rule runs out, or decline."
          bodyClassName="p-3"
        >
          <div className="flex flex-col gap-3">
            {fixed.length === 0 && <Empty hint={filter !== 'all' ? 'Try the All filter.' : 'The board posts on its own interval; "post loads" adds a burst.'}>{filter !== 'all' ? 'No fixed-rate loads match this filter.' : 'No fixed-rate loads open right now.'}</Empty>}
            {fixed.map((s) => (
              <LoadCard key={s.external_id} s={s} simNow={simNow} onChanged={onChanged} />
            ))}
          </div>
        </Panel>
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <Shield kind="bid" className="h-[22px] w-[25px]" /> Open bids <span className="num text-ink-3">{bids.length}</span>
            </span>
          }
          subtitle="No posted price. The model suggests the expected-profit-optimal bid above your cost-plus floor."
          bodyClassName="p-3"
        >
          <div className="flex flex-col gap-3">
            {bids.length === 0 && <Empty hint={filter !== 'all' ? 'Try the All filter.' : 'Roughly half of posted loads are open bids.'}>{filter !== 'all' ? 'No open-bid loads match this filter.' : 'No open-bid loads right now.'}</Empty>}
            {bids.map((s) => (
              <LoadCard key={s.external_id} s={s} simNow={simNow} onChanged={onChanged} />
            ))}
          </div>
        </Panel>
      </div>

      <ActiveTable active={active} history={history} simNow={simNow} />
    </div>
  )
}

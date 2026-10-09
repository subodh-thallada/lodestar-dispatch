import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Shipment } from '../types'
import { Empty, Seg, Shield } from './ui'
import { LoadCard, useSorted, type Outcome } from './LoadCard'
import { ActiveTable } from './ActiveTable'

type Filter = 'all' | 'recommended' | 'hold' | 'pass'
type Stamped = { s: Shipment; outcome: Outcome; at: number }

const KEEP_MS = 45_000

export function LoadBoard({ open, active, history, simNow, onChanged }: { open: Shipment[]; active: Shipment[]; history: Shipment[]; simNow: number; onChanged: () => void }) {
  const [sort, setSort] = useState<'score' | 'expiry' | 'margin'>('score')
  const [filter, setFilter] = useState<Filter>('all')
  // Stamped entries stay printed in their column (grayscale, stamped) after the board
  // retires them from the open list — nothing disappears, it cancels.
  const [stamped, setStamped] = useState<Record<string, Stamped>>({})
  const onStamped = useCallback((s: Shipment, outcome: Outcome) => setStamped((m) => ({ ...m, [s.external_id]: { s, outcome, at: Date.now() } })), [])
  useEffect(() => {
    const id = window.setInterval(() => {
      const cutoff = Date.now() - KEEP_MS
      setStamped((m) => {
        const next = Object.fromEntries(Object.entries(m).filter(([, v]) => v.at > cutoff))
        return Object.keys(next).length === Object.keys(m).length ? m : next
      })
    }, 5000)
    return () => window.clearInterval(id)
  }, [])

  const merged = useMemo(() => {
    const ids = new Set(open.map((s) => s.external_id))
    const retired = Object.values(stamped)
      .filter((v) => !ids.has(v.s.external_id))
      .map((v) => v.s)
    return [...open, ...retired]
  }, [open, stamped])
  const sorted = useSorted(merged, sort)

  const keep = (s: Shipment) => {
    if (stamped[s.external_id]) return true
    const r = s.recommendation
    if (filter === 'recommended') return r === 'accept' || r === 'bid'
    if (filter === 'hold') return r === 'hold'
    if (filter === 'pass') return r === 'decline' || r === 'skip'
    return true
  }
  const fixed = sorted.filter((s) => s.order_type === 'fixed_rate' && keep(s))
  const bids = sorted.filter((s) => s.order_type === 'open_bid' && keep(s))

  const column = (kind: 'bin' | 'bid', title: string, sub: string, rows: Shipment[], emptyText: string, hint: string) => (
    <section className="border-t-2 border-ink">
      <header className="border-b border-rule px-1 pb-2.5 pt-3">
        <h2 className="inline-flex items-center gap-2 font-condensed text-[17px] font-bold uppercase tracking-[0.08em] text-ink">
          <Shield kind={kind} className="h-[24px] w-[27px]" /> {title} <span className="num text-ink-3">{rows.length}</span>
        </h2>
        <p className="mt-0.5 text-xs text-ink-3">{sub}</p>
      </header>
      {rows.length === 0 ? (
        <div className="py-3">
          <Empty hint={hint}>{emptyText}</Empty>
        </div>
      ) : (
        <div className="divide-y divide-rule">
          {rows.map((s) => (
            <LoadCard key={s.external_id} s={stamped[s.external_id]?.s ?? s} simNow={simNow} onChanged={onChanged} onStamped={onStamped} outcome={stamped[s.external_id]?.outcome ?? null} />
          ))}
        </div>
      )}
    </section>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <span className="label">Show</span>
        <Seg value={filter} onChange={setFilter} options={[['all', 'All'], ['recommended', 'Recommended'], ['hold', 'Hold'], ['pass', 'Pass']]} />
        <span className="label ml-2">Order by</span>
        <Seg value={sort} onChange={setSort} options={[['score', 'Score'], ['margin', 'Margin'], ['expiry', 'Expiry']]} />
      </div>

      <div className="grid gap-x-8 gap-y-6 xl:grid-cols-2">
        {column('bin', 'Book-It-Now', 'Fixed-rate offers. Accept before the rule runs out, or decline.', fixed, filter !== 'all' ? 'No fixed-rate loads match this filter.' : 'No fixed-rate loads open right now.', filter !== 'all' ? 'Try the All filter.' : 'The board posts on its own interval; "post loads" adds a burst.')}
        {column('bid', 'Open bids', 'No posted price. The model suggests the expected-profit-optimal bid above your cost-plus floor.', bids, filter !== 'all' ? 'No open-bid loads match this filter.' : 'No open-bid loads right now.', filter !== 'all' ? 'Try the All filter.' : 'Roughly half of posted loads are open bids.')}
      </div>

      <ActiveTable active={active} history={history} simNow={simNow} />
    </div>
  )
}

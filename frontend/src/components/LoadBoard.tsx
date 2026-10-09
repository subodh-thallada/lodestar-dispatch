import { useState } from 'react'
import { Gavel, Zap } from 'lucide-react'
import type { Shipment } from '../types'
import { Empty, Panel } from './ui'
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

  const controls = (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Seg value={filter} onChange={setFilter} options={[['all', 'All'], ['recommended', 'Recommended'], ['hold', 'Hold'], ['pass', 'Pass']]} />
      <Seg value={sort} onChange={setSort} options={[['score', 'Score'], ['margin', 'Margin'], ['expiry', 'Expiry']]} />
    </div>
  )

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <Zap size={14} className="text-sky-400" /> Book-It-Now <span className="font-mono text-xs text-slate-400">{fixed.length}</span>
          </span>
        }
        subtitle="Fixed-rate offers: accept before they expire, or decline"
        right={controls}
      >
        <div className="flex flex-col gap-3">
          {fixed.length === 0 && <Empty>No fixed-rate loads{filter !== 'all' ? ' match this filter' : ' on the board right now'}.</Empty>}
          {fixed.map((s) => (
            <LoadCard key={s.external_id} s={s} simNow={simNow} onChanged={onChanged} />
          ))}
        </div>
      </Panel>
      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <Gavel size={14} className="text-violet-400" /> Open Bids <span className="font-mono text-xs text-slate-400">{bids.length}</span>
          </span>
        }
        subtitle="No posted price — the model suggests an EV-optimal bid above your cost-plus floor"
      >
        <div className="flex flex-col gap-3">
          {bids.length === 0 && <Empty>No open-bid loads{filter !== 'all' ? ' match this filter' : ' on the board right now'}.</Empty>}
          {bids.map((s) => (
            <LoadCard key={s.external_id} s={s} simNow={simNow} onChanged={onChanged} />
          ))}
        </div>
      </Panel>
      <div className="xl:col-span-2">
        <ActiveTable active={active} history={history} simNow={simNow} />
      </div>
    </div>
  )
}

export function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-slate-700 bg-slate-950">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} className={`px-2 py-1 text-xs transition ${value === v ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
          {label}
        </button>
      ))}
    </div>
  )
}

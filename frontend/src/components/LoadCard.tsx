import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, ChevronDown, ChevronUp, Gavel, ShieldAlert, X } from 'lucide-react'
import { api, ApiError } from '../api'
import { countdown, cx, fmtSim, lbs, miles, money, parseTs, pct } from '../lib/format'
import type { Evaluation, Recommendation, Shipment } from '../types'
import { Badge, Button, type Tone } from './ui'
import { useToast } from './Toast'

const recTone: Record<Recommendation, Tone> = { accept: 'good', bid: 'good', decline: 'bad', skip: 'bad', hold: 'warn' }
const recLabel: Record<Recommendation, string> = { accept: 'ACCEPT', bid: 'BID', decline: 'DECLINE', skip: 'PASS', hold: 'HOLD' }

function interpWin(ev: Evaluation, bid: number): number | null {
  const c = ev.pricing?.ev_curve
  if (!c || c.length < 2) return null
  if (bid <= c[0].bid) return c[0].p_win
  if (bid >= c[c.length - 1].bid) return c[c.length - 1].p_win
  for (let i = 1; i < c.length; i++) {
    if (bid <= c[i].bid) {
      const f = (bid - c[i - 1].bid) / (c[i].bid - c[i - 1].bid)
      return c[i - 1].p_win + (c[i].p_win - c[i - 1].p_win) * f
    }
  }
  return null
}

export function Guardrails({ ev }: { ev: Evaluation }) {
  return (
    <div className="flex flex-wrap gap-1">
      {ev.guardrails.map((g) => (
        <Badge key={g.name} tone={g.passed ? 'good' : g.overridable ? 'warn' : 'bad'} title={g.detail}>
          {g.passed ? <Check size={11} /> : <X size={11} />}
          {g.name}
        </Badge>
      ))}
    </div>
  )
}

export function LoadCard({ s, simNow, onChanged }: { s: Shipment; simNow: number; onChanged?: () => void }) {
  const ev = s.evaluation
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [override, setOverride] = useState(false)
  const [bid, setBid] = useState<string>('')
  const [gone, setGone] = useState(false)

  useEffect(() => {
    if (ev?.pricing && bid === '') setBid(String(Math.round(ev.pricing.suggested_bid)))
  }, [ev?.pricing, bid])

  const remaining = Math.max(0, (parseTs(s.expires_at) - simNow) / 1000)
  const ttl = Math.max(1, (parseTs(s.expires_at) - parseTs(s.board_created_at)) / 1000)
  const urgency = remaining / ttl
  const overweight = ev ? ev.guardrails.some((g) => g.name === 'weight' && !g.passed) : s.weight_lbs > 44000
  const isBid = s.order_type === 'open_bid'
  const bidNum = Number(bid) || 0
  const liveMargin = ev && isBid ? bidNum - ev.total_cost : ev?.margin ?? null
  const liveMarginPct = ev && isBid && bidNum ? liveMargin! / bidNum : ev?.margin_pct ?? null
  const liveWin = ev && isBid ? interpWin(ev, bidNum) : null
  const liveEv = liveWin != null && liveMargin != null ? liveWin * liveMargin : null
  const blocked = ev ? !ev.bookable : false
  const fatal = ev ? ev.guardrails.some((g) => !g.passed && !g.overridable) : false
  const rec = s.recommendation ?? ev?.recommendation ?? null

  const act = async (action: 'accept' | 'decline' | 'bid') => {
    setBusy(action)
    try {
      const body: { bid_rate?: number; override?: boolean } = { override }
      if (action === 'bid') body.bid_rate = bidNum
      const r = await api.act(s.external_id, action, body)
      toast.push('success', action === 'bid' ? `Bid ${money(bidNum)} submitted` : action === 'accept' ? `Booked ${s.external_id}` : `Declined ${s.external_id}`, r.message)
      setGone(true)
      onChanged?.()
    } catch (e) {
      const err = e as ApiError
      const payload = err.payload as { message?: string; evaluation?: Evaluation } | undefined
      toast.push(err.status === 422 ? 'warn' : 'error', err.status === 422 ? 'Blocked by guardrails' : `Board rejected ${action}`, payload?.message ?? err.message)
      onChanged?.()
    } finally {
      setBusy(null)
    }
  }

  const marginTone: Tone = liveMargin == null ? 'neutral' : liveMargin < 0 ? 'bad' : liveMargin < 150 ? 'warn' : 'good'

  return (
    <article className={cx('rounded-xl border bg-slate-900/80 transition', gone && 'opacity-40', rec === 'accept' || rec === 'bid' ? 'border-emerald-500/30' : rec === 'hold' ? 'border-amber-500/30' : rec ? 'border-slate-800' : 'border-slate-800')}>
      <div className="h-1 w-full overflow-hidden rounded-t-xl bg-slate-800">
        <div className={cx('h-full transition-[width] duration-500', urgency < 0.2 ? 'bg-rose-500' : urgency < 0.5 ? 'bg-amber-500' : 'bg-sky-500')} style={{ width: `${urgency * 100}%` }} />
      </div>
      <div className="p-3">
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs text-slate-400">{s.external_id}</span>
              <Badge tone={isBid ? 'accent' : 'info'}>{isBid ? 'OPEN BID' : 'BOOK IT NOW'}</Badge>
              {rec && <Badge tone={recTone[rec]}>{recLabel[rec]}</Badge>}
              {overweight && (
                <Badge tone="bad">
                  <ShieldAlert size={11} /> OVERWEIGHT
                </Badge>
              )}
              {ev?.predicted_unit?.positioned_by && <Badge tone="accent" title={`Chains off ${ev.predicted_unit.positioned_by}`}>CHAIN</Badge>}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-100">
              <span className="truncate">
                {s.origin.city}, {s.origin.state}
              </span>
              <ArrowRight size={14} className="shrink-0 text-slate-500" />
              <span className="truncate">
                {s.destination.city}, {s.destination.state}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-slate-400">
              <span className="font-mono">{s.lane_id}</span> · {miles(s.distance_miles)} · {lbs(s.weight_lbs)} · pickup {fmtSim(s.pickup_at, { date: true })} → drop {fmtSim(s.delivery_at, { date: true })}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className={cx('font-mono text-sm tabular-nums', remaining < 60 ? 'text-rose-300' : 'text-slate-200')}>{countdown(remaining)}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">to expiry</div>
          </div>
        </header>

        {ev && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
            <Cell label={isBid ? 'Your bid' : 'Offer'} value={money(isBid ? bidNum : s.offered_rate)} />
            <Cell label="Loaded cost" value={money(ev.loaded_cost)} />
            <Cell label="Deadhead" value={`${Math.round(ev.deadhead_miles)} mi`} sub={money(ev.deadhead_cost)} tone={ev.deadhead_miles > 150 ? 'warn' : 'neutral'} />
            <Cell label="Total cost" value={money(ev.total_cost)} />
            <Cell label="Margin" value={money(liveMargin)} sub={pct(liveMarginPct)} tone={marginTone} />
            {isBid ? (
              <Cell label="P(win) · EV" value={liveWin == null ? '—' : pct(liveWin, 0)} sub={liveEv == null ? '' : money(liveEv)} tone="info" />
            ) : (
              <Cell label="$/lock-hour" value={money(ev.margin_per_hour)} sub={ev.lock_hours ? `${Math.round(ev.lock_hours)}h locked` : ''} />
            )}
          </div>
        )}

        {ev && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <Guardrails ev={ev} />
            <div className="text-[11px] text-slate-400">
              {ev.predicted_unit ? (
                <>
                  board binds <span className="font-mono text-slate-200">{ev.predicted_unit.unit_number}</span> · {ev.origin_capacity?.projected_free}/{ev.origin_capacity?.usable} free at {s.origin.hub_code}
                </>
              ) : (
                <span className="text-amber-300">no free unit at {s.origin.hub_code}</span>
              )}
              {ev.score != null && (
                <>
                  {' '}
                  · score <span className="font-mono text-slate-200">{Math.round(ev.score)}</span>
                </>
              )}
            </div>
          </div>
        )}

        {ev && ev.reasons.length > 0 && (
          <div className="mt-2 text-xs text-slate-300">
            <ul className="space-y-0.5">
              {(open ? ev.reasons : ev.reasons.slice(0, 2)).map((r, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-slate-600">▸</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
            {ev.reasons.length > 2 && (
              <button onClick={() => setOpen((o) => !o)} className="mt-1 inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300">
                {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {open ? 'less' : `${ev.reasons.length - 2} more`}
              </button>
            )}
          </div>
        )}

        <footer className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
          {isBid ? (
            <>
              <label className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-sm focus-within:border-sky-500">
                <span className="text-slate-500">$</span>
                <input
                  value={bid}
                  onChange={(e) => setBid(e.target.value.replace(/[^0-9.]/g, ''))}
                  inputMode="decimal"
                  className="w-24 bg-transparent text-slate-100 outline-none"
                  aria-label="Bid amount in USD"
                />
              </label>
              {ev?.pricing && (
                <div className="flex gap-1">
                  <Button size="sm" onClick={() => setBid(String(Math.round(ev.pricing!.suggested_bid)))} title="Expected-profit-optimal bid from the pricing model">
                    suggest {money(ev.pricing.suggested_bid)}
                  </Button>
                  <Button size="sm" onClick={() => setBid(String(Math.round(ev.pricing!.floor_bid)))} title="Cost-plus floor from policy">
                    floor {money(ev.pricing.floor_bid)}
                  </Button>
                </div>
              )}
              <Button tone="accent" disabled={busy != null || gone || fatal || bidNum <= 0 || (blocked && !override)} onClick={() => act('bid')}>
                <Gavel size={14} /> {busy === 'bid' ? 'Submitting…' : 'Submit bid'}
              </Button>
            </>
          ) : (
            <>
              <Button tone="good" disabled={busy != null || gone || fatal || (blocked && !override)} onClick={() => act('accept')}>
                <Check size={14} /> {busy === 'accept' ? 'Booking…' : 'Accept'}
              </Button>
              <Button tone="bad" disabled={busy != null || gone} onClick={() => act('decline')}>
                <X size={14} /> {busy === 'decline' ? 'Declining…' : 'Decline'}
              </Button>
            </>
          )}
          {isBid && (
            <Button tone="neutral" size="sm" disabled={busy != null || gone} onClick={() => act('decline')} title="Decline (do not bid)">
              <X size={12} /> Pass
            </Button>
          )}
          {blocked && !fatal && (
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] text-amber-300">
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="accent-amber-500" />
              override guardrails
            </label>
          )}
          {fatal && <span className="ml-auto text-[11px] text-rose-300">board will reject this load</span>}
        </footer>
      </div>
    </article>
  )
}

function Cell({ label, value, sub, tone = 'neutral' }: { label: string; value: string; sub?: string; tone?: Tone }) {
  const color = tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-rose-300' : tone === 'warn' ? 'text-amber-300' : tone === 'info' ? 'text-sky-300' : 'text-slate-100'
  return (
    <div className="rounded-md bg-slate-950/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cx('font-mono text-sm tabular-nums', color)}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  )
}

export function useSorted(list: Shipment[], mode: 'score' | 'expiry' | 'margin') {
  return useMemo(() => {
    const arr = [...list]
    if (mode === 'expiry') arr.sort((a, b) => parseTs(a.expires_at) - parseTs(b.expires_at))
    else if (mode === 'margin') arr.sort((a, b) => (b.evaluation?.margin ?? -1e9) - (a.evaluation?.margin ?? -1e9))
    else
      arr.sort((a, b) => {
        const ba = a.evaluation?.bookable ? 0 : 1
        const bb = b.evaluation?.bookable ? 0 : 1
        if (ba !== bb) return ba - bb
        return (b.evaluation?.score ?? -1e9) - (a.evaluation?.score ?? -1e9)
      })
    return arr
  }, [list, mode])
}

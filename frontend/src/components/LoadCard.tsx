import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, ChevronDown, ChevronRight, ChevronUp, Gavel, Link2, X } from 'lucide-react'
import { api, ApiError } from '../api'
import { countdown, cx, fmtSim, lbs, miles, money, parseTs, pct } from '../lib/format'
import type { Evaluation, Recommendation, Shipment } from '../types'
import { Button, Shield, Stamp, Tag, type Tone } from './ui'
import { useToast } from './Toast'

const recTone: Record<Recommendation, Tone> = { accept: 'good', bid: 'accent', decline: 'bad', skip: 'bad', hold: 'warn' }
const recLabel: Record<Recommendation, string> = { accept: 'Accept', bid: 'Bid', decline: 'Decline', skip: 'Pass', hold: 'Hold' }

export type Outcome = { label: string; tone: Tone }

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
    <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="guardrails">
      {ev.guardrails.map((g) => (
        <li key={g.name} title={g.detail} className={cx('inline-flex items-center gap-1 font-condensed text-[12px] font-semibold uppercase tracking-[0.06em]', g.passed ? 'text-green-ink' : g.overridable ? 'text-yellow-ink' : 'text-red-ink')}>
          {g.passed ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
          {g.name}
        </li>
      ))}
    </ul>
  )
}

/**
 * One route-log entry. Entries are separated by rules, never boxed; the entry's own top
 * rule is its expiry, draining left to right. A decision lands as a stamp and the entry
 * prints in grayscale until the board retires it — nothing disappears, it cancels.
 */
export function LoadCard({ s, simNow, onChanged, onStamped, outcome: initialOutcome }: { s: Shipment; simNow: number; onChanged?: () => void; onStamped?: (s: Shipment, o: Outcome) => void; outcome?: Outcome | null }) {
  const ev = s.evaluation
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [override, setOverride] = useState(false)
  const [bid, setBid] = useState<string>('')
  const [outcome, setOutcome] = useState<Outcome | null>(initialOutcome ?? null)

  useEffect(() => {
    if (ev?.pricing && bid === '') setBid(String(Math.round(ev.pricing.suggested_bid)))
  }, [ev?.pricing, bid])

  const remaining = Math.max(0, (parseTs(s.expires_at) - simNow) / 1000)
  const ttl = Math.max(1, (parseTs(s.expires_at) - parseTs(s.board_created_at)) / 1000)
  const urgency = remaining / ttl
  const overweight = ev ? ev.guardrails.some((g) => g.name === 'weight' && !g.passed) : s.weight_lbs > 44000
  const isBid = s.order_type === 'open_bid'
  const bidNum = Number(bid) || 0
  const liveMargin = ev && isBid ? bidNum - ev.total_cost : (ev?.margin ?? null)
  const liveMarginPct = ev && isBid && bidNum ? liveMargin! / bidNum : (ev?.margin_pct ?? null)
  const liveWin = ev && isBid ? interpWin(ev, bidNum) : null
  const liveEv = liveWin != null && liveMargin != null ? liveWin * liveMargin : null
  const blocked = ev ? !ev.bookable : false
  const expiredNow = remaining <= 0 || s.status !== 'open'
  const fatal = expiredNow || (ev ? ev.guardrails.some((g) => !g.passed && !g.overridable) : false)
  const rec = s.recommendation ?? ev?.recommendation ?? null
  const done = outcome != null
  const printed = done || expiredNow

  const act = async (action: 'accept' | 'decline' | 'bid') => {
    setBusy(action)
    try {
      const body: { bid_rate?: number; override?: boolean } = { override }
      if (action === 'bid') body.bid_rate = bidNum
      const r = await api.act(s.external_id, action, body)
      const o: Outcome = action === 'bid' ? { label: 'Bid in', tone: 'accent' } : action === 'accept' ? { label: 'Booked', tone: 'good' } : { label: 'Declined', tone: 'bad' }
      setOutcome(o)
      onStamped?.(s, o)
      toast.push('success', action === 'bid' ? `Bid ${money(bidNum)} submitted` : action === 'accept' ? `${s.external_id} booked` : `${s.external_id} declined`, r.message)
    } catch (e) {
      const err = e as ApiError
      const payload = err.payload as { message?: string } | undefined
      toast.push(err.status === 422 ? 'warn' : 'error', err.status === 422 ? 'Held by guardrails' : `Board refused the ${action}`, payload?.message ?? err.message)
      onChanged?.()
    } finally {
      setBusy(null)
    }
  }

  const marginTone: Tone = liveMargin == null ? 'neutral' : liveMargin < 0 ? 'bad' : liveMargin < 150 ? 'warn' : 'good'
  const ruleColor = urgency < 0.2 ? 'bg-red' : urgency < 0.5 ? 'bg-yellow' : 'bg-road'

  return (
    <article className={cx('relative animate-lay-down transition-[filter,opacity] duration-500', printed && 'grayscale opacity-55')} aria-label={`${s.external_id} ${s.lane_id}`}>
      {/* the entry's top rule is its expiry, draining left to right */}
      <div className="h-[3px] w-full bg-paper-3" aria-hidden>
        <div className={cx('h-full transition-[width] duration-500 ease-linear', ruleColor)} style={{ width: `${urgency * 100}%` }} />
      </div>

      {done && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <Stamp tone={outcome!.tone} size="lg" pressed>
            {outcome!.label}
          </Stamp>
        </div>
      )}

      <div className="px-1 pb-4 pt-3">
        <header className="flex items-start gap-3">
          <Shield kind={isBid ? 'bid' : 'bin'} className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="flex min-w-0 flex-wrap items-center gap-x-1.5 font-condensed text-[21px] font-bold uppercase leading-none tracking-[0.03em] text-ink">
                <span>
                  {s.origin.city}, {s.origin.state}
                </span>
                <ArrowRight size={16} className="shrink-0 text-ink-3" />
                <span>
                  {s.destination.city}, {s.destination.state}
                </span>
              </h3>
              {ev?.predicted_unit?.positioned_by && (
                <Tag tone="accent" title={`Chains off ${ev.predicted_unit.positioned_by}: deadhead measured from that drop`}>
                  <Link2 size={11} /> chain
                </Tag>
              )}
              {overweight && <Tag tone="bad">overweight</Tag>}
            </div>
            <div className="label mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 normal-case tracking-[0.02em]">
              <span className="num uppercase tracking-[0.06em]">{s.external_id}</span>
              <span className="num uppercase tracking-[0.06em] text-ink-2">{s.lane_id}</span>
              <span className="num">{miles(s.distance_miles)}</span>
              <span className="num">{lbs(s.weight_lbs)}</span>
              <span className="num inline-flex flex-wrap items-center gap-x-1">
                <span className="whitespace-nowrap">pickup {fmtSim(s.pickup_at, { date: true })}</span>
                <ArrowRight size={11} className="text-ink-3" />
                <span className="whitespace-nowrap">drop {fmtSim(s.delivery_at, { date: true })}</span>
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {expiredNow && !done ? <Stamp tone="neutral">Expired</Stamp> : rec && <Stamp tone={recTone[rec]}>{recLabel[rec]}</Stamp>}
            <div className={cx('num font-condensed text-[15px] font-bold leading-none', remaining < 60 ? 'text-red-ink' : 'text-ink-2')} title="time left to act">
              {countdown(remaining)}
            </div>
          </div>
        </header>

        {ev && (
          <dl className="num mt-3 grid grid-cols-3 border-y border-rule sm:grid-cols-6">
            <Cell label={isBid ? 'Your bid' : 'Offer'} v={money(isBid ? bidNum : s.offered_rate)} />
            <Cell label="Loaded cost" v={money(ev.loaded_cost)} />
            <Cell label="Empty miles" v={`${Math.round(ev.deadhead_miles)} mi`} sub={money(ev.deadhead_cost)} tone={ev.deadhead_miles > 150 ? 'warn' : 'neutral'} />
            <Cell label="Total cost" v={money(ev.total_cost)} />
            <Cell label="Margin" v={money(liveMargin)} sub={pct(liveMarginPct)} tone={marginTone} />
            {isBid ? <Cell label="P(win) · EV" v={liveWin == null ? '—' : pct(liveWin, 0)} sub={liveEv == null ? '' : `EV ${money(liveEv)}`} tone="accent" /> : <Cell label="$ / lock-hour" v={money(ev.margin_per_hour)} sub={ev.lock_hours ? `${Math.round(ev.lock_hours)} h locked` : ''} />}
          </dl>
        )}

        {ev && (
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
            <Guardrails ev={ev} />
            <div className="label normal-case tracking-[0.02em] text-ink-3">
              {ev.predicted_unit ? (
                <>
                  board binds <span className="num font-semibold uppercase text-ink-2">{ev.predicted_unit.unit_number}</span> · <span className="num">{ev.origin_capacity?.projected_free}/{ev.origin_capacity?.usable}</span> free at {s.origin.hub_code}
                </>
              ) : (
                <span className="text-yellow-ink">no free unit at {s.origin.hub_code}</span>
              )}
              {ev.score != null && (
                <>
                  {' '}
                  · score <span className="num font-semibold text-ink-2">{Math.round(ev.score)}</span>
                </>
              )}
            </div>
          </div>
        )}

        {ev && ev.reasons.length > 0 && (
          <div className="mt-2 text-[13px] leading-snug text-ink-2">
            <ul className="space-y-0.5">
              {(open ? ev.reasons : ev.reasons.slice(0, 2)).map((r, i) => (
                <li key={i} className="flex gap-1">
                  <ChevronRight size={13} className="mt-[3px] shrink-0 text-rule-2" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
            {ev.reasons.length > 2 && (
              <button onClick={() => setOpen((o) => !o)} className="mt-1 inline-flex items-center gap-0.5 font-condensed text-[12px] font-semibold uppercase tracking-[0.06em] text-road-ink hover:underline">
                {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {open ? 'less' : `${ev.reasons.length - 2} more`}
              </button>
            )}
          </div>
        )}

        <footer className="mt-3 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
          {isBid ? (
            <>
              <label className="num flex h-9 items-center gap-1 border border-rule-2 bg-paper px-2 font-condensed text-[16px] font-bold focus-within:border-road">
                <span className="text-ink-3">$</span>
                <input value={bid} onChange={(e) => setBid(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className="w-24 bg-transparent text-ink outline-none" aria-label="bid amount in US dollars" disabled={printed} />
              </label>
              {ev?.pricing && (
                <div className="flex gap-1">
                  <Button size="sm" onClick={() => setBid(String(Math.round(ev.pricing!.suggested_bid)))} title="Expected-profit-optimal bid from the pricing model" disabled={printed}>
                    suggest {money(ev.pricing.suggested_bid)}
                  </Button>
                  <Button size="sm" onClick={() => setBid(String(Math.round(ev.pricing!.floor_bid)))} title="Cost-plus floor from policy" disabled={printed}>
                    floor {money(ev.pricing.floor_bid)}
                  </Button>
                </div>
              )}
              <Button tone="accent" disabled={busy != null || printed || fatal || bidNum <= 0 || (blocked && !override)} onClick={() => act('bid')}>
                <Gavel size={14} /> {busy === 'bid' ? 'Submitting…' : 'Submit bid'}
              </Button>
              <Button tone="bad" size="sm" disabled={busy != null || printed} onClick={() => act('decline')} title="Decline without bidding">
                <X size={12} /> Pass
              </Button>
            </>
          ) : (
            <>
              <Button tone="good" disabled={busy != null || printed || fatal || (blocked && !override)} onClick={() => act('accept')}>
                <Check size={14} strokeWidth={3} /> {busy === 'accept' ? 'Booking…' : 'Accept'}
              </Button>
              <Button tone="bad" disabled={busy != null || printed} onClick={() => act('decline')}>
                <X size={14} strokeWidth={3} /> {busy === 'decline' ? 'Declining…' : 'Decline'}
              </Button>
            </>
          )}
          {blocked && !fatal && !printed && (
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 font-condensed text-[12px] font-semibold uppercase tracking-[0.06em] text-yellow-ink">
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="accent-yellow-ink" />
              override guardrails
            </label>
          )}
          {fatal && !done && <span className="ml-auto font-condensed text-[12px] font-semibold uppercase tracking-[0.06em] text-red-ink">{expiredNow ? 'expired on the board' : 'board will reject this load'}</span>}
        </footer>
      </div>
    </article>
  )
}

function Cell({ label, v, sub, tone = 'neutral' }: { label: string; v: string; sub?: string; tone?: Tone }) {
  const color: Record<Tone, string> = { neutral: 'text-ink', good: 'text-green-ink', bad: 'text-red-ink', warn: 'text-yellow-ink', info: 'text-road-ink', accent: 'text-carbon-ink' }
  return (
    <div className="min-w-0 py-1.5 pr-2 [&:not(:first-child)]:pl-2 [&:not(:first-child)]:border-l [&:not(:first-child)]:border-rule sm:[&:nth-child(4)]:border-l max-sm:[&:nth-child(4)]:border-l-0 max-sm:[&:nth-child(4)]:pl-0 max-sm:[&:nth-child(n+4)]:border-t max-sm:[&:nth-child(n+4)]:border-rule">
      <dt className="label truncate">{label}</dt>
      <dd className={cx('mt-1 font-condensed text-[18px] font-bold leading-none', color[tone])}>{v}</dd>
      <dd className="mt-0.5 text-[11px] leading-none text-ink-3">{sub || ' '}</dd>
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

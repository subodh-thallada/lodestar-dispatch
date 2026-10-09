import { useEffect, useState } from 'react'
import { ChevronRight, Play } from 'lucide-react'
import { api } from '../api'
import type { Decision, Policy } from '../types'
import { cx, fmtSim, money } from '../lib/format'
import { Button, Empty, Panel, Seg, Stamp, Tag, type Tone } from './ui'
import { useToast } from './Toast'

const actionTone: Record<string, Tone> = { accept: 'good', bid: 'accent', decline: 'bad', skip: 'neutral' }
const outcomeTone: Record<string, Tone> = { ok: 'good', blocked: 'warn', rejected: 'bad', error: 'bad' }

export function AutopilotPanel({ policy, decisions, autopilot, onPolicy }: { policy: Policy | null; decisions: Decision[]; autopilot: { mode: string; runs: number; actions: number; last_run_at: string | null } | null; onPolicy: (p: Policy) => void }) {
  const toast = useToast()
  const [draft, setDraft] = useState<Policy | null>(policy)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'all' | 'autopilot' | 'dispatcher'>('all')
  useEffect(() => setDraft(policy), [policy])

  const setMode = async (mode: Policy['autopilot_mode']) => {
    try {
      await api.setAutopilot(mode)
      toast.push(mode === 'execute' ? 'warn' : 'info', `Auto-pilot ${mode}`, mode === 'execute' ? 'It books, bids and declines through the same guardrails you see on every entry.' : mode === 'advise' ? 'Recommendations only. Nothing is booked without a click.' : 'Dormant.')
      onPolicy({ ...(draft ?? policy!), autopilot_mode: mode })
    } catch (e) {
      toast.push('error', 'Could not change mode', (e as Error).message)
    }
  }

  const save = async () => {
    if (!draft) return
    setSaving(true)
    try {
      const p = await api.updatePolicy(draft)
      onPolicy(p)
      toast.push('success', 'Policy applied', 'Every open load was re-graded under the new rules.')
    } catch (e) {
      toast.push('error', 'Policy not saved', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const runOnce = async () => {
    try {
      const r = await api.runAutopilot()
      toast.push('info', 'One pass complete', Object.entries(r).map(([k, v]) => `${k} ${v}`).join(' · '))
    } catch (e) {
      toast.push('error', 'Pass failed', (e as Error).message)
    }
  }

  const list = decisions.filter((d) => filter === 'all' || d.actor === filter)

  return (
    <div className="grid gap-4 xl:grid-cols-[400px_1fr]">
      <div className="space-y-4">
        <Panel title="Auto-pilot" subtitle="Books without a click, only when every guardrail passes.">
          <Seg value={(policy?.autopilot_mode ?? 'off') as Policy['autopilot_mode']} onChange={setMode} options={[['off', 'Off'], ['advise', 'Advise'], ['execute', 'Execute']]} className="w-full [&>button]:flex-1" />
          <p className="mt-2.5 text-[13px] leading-snug text-ink-2">
            {policy?.autopilot_mode === 'execute' ? 'Executing: scores the open board every two seconds, books the best feasible loads first, declines clear losers, and leaves borderline calls for you.' : policy?.autopilot_mode === 'advise' ? 'Advising: every entry shows what it would do and why.' : 'Off.'}
          </p>
          {autopilot && (
            <dl className="num mt-3 grid grid-cols-3 border-y border-rule py-2 text-center">
              <div>
                <dt className="label">Passes</dt>
                <dd className="mt-1 font-condensed text-[20px] font-bold leading-none text-ink">{autopilot.runs}</dd>
              </div>
              <div className="border-x border-rule">
                <dt className="label">Actions</dt>
                <dd className="mt-1 font-condensed text-[20px] font-bold leading-none text-ink">{autopilot.actions}</dd>
              </div>
              <div>
                <dt className="label">Last pass</dt>
                <dd className="mt-1 font-condensed text-[20px] font-bold leading-none text-ink">{autopilot.last_run_at ? new Date(autopilot.last_run_at).toLocaleTimeString('en-US', { hour12: false }) : '—'}</dd>
              </div>
            </dl>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <Button size="sm" onClick={runOnce} title="Run a single pass now (acts only in execute mode)">
              <Play size={12} /> run one pass
            </Button>
            <label className="flex items-center gap-1.5 font-condensed text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-2">
              <input type="checkbox" checked={!!draft?.autopilot_auto_decline} onChange={(e) => draft && setDraft({ ...draft, autopilot_auto_decline: e.target.checked })} /> auto-decline clear losers
            </label>
          </div>
        </Panel>

        <Panel title="Dispatch policy" subtitle="Guardrails every accept and bid must clear. A dispatcher can override; auto-pilot cannot." bodyClassName="p-0">
          {draft && (
            <div>
              <Field label="Minimum margin" value={money(draft.min_margin_usd)}>
                <input type="range" min={0} max={1000} step={25} value={draft.min_margin_usd} onChange={(e) => setDraft({ ...draft, min_margin_usd: Number(e.target.value) })} className="w-full" aria-label="minimum margin in dollars" />
              </Field>
              <Field label="Minimum margin %" value={`${Math.round(draft.min_margin_pct * 100)}%`}>
                <input type="range" min={0} max={40} step={1} value={Math.round(draft.min_margin_pct * 100)} onChange={(e) => setDraft({ ...draft, min_margin_pct: Number(e.target.value) / 100 })} className="w-full" aria-label="minimum margin percent" />
              </Field>
              <Field label="Max empty miles" value={`${draft.max_deadhead_miles} mi`}>
                <input type="range" min={25} max={400} step={5} value={draft.max_deadhead_miles} onChange={(e) => setDraft({ ...draft, max_deadhead_miles: Number(e.target.value) })} className="w-full" aria-label="maximum deadhead miles" />
              </Field>
              <Field label="Reserve units per hub" value={String(draft.reserve_units_per_terminal)}>
                <input type="range" min={0} max={4} step={1} value={draft.reserve_units_per_terminal} onChange={(e) => setDraft({ ...draft, reserve_units_per_terminal: Number(e.target.value) })} className="w-full" aria-label="reserve units per hub" />
              </Field>
              <Field label="Target bid margin" value={`${Math.round(draft.target_bid_margin_pct * 100)}%`}>
                <input type="range" min={5} max={50} step={1} value={Math.round(draft.target_bid_margin_pct * 100)} onChange={(e) => setDraft({ ...draft, target_bid_margin_pct: Number(e.target.value) / 100 })} className="w-full" aria-label="target bid margin percent" />
              </Field>
              <Field label="Chaining weight" value={draft.chain_weight.toFixed(2)}>
                <input type="range" min={0} max={1} step={0.05} value={draft.chain_weight} onChange={(e) => setDraft({ ...draft, chain_weight: Number(e.target.value) })} className="w-full" aria-label="chaining weight" />
              </Field>
              <div className="grid grid-cols-2">
                <Field label="Average speed" value={`${draft.avg_speed_mph} mph`} className="border-r border-rule">
                  <input type="range" min={35} max={65} step={1} value={draft.avg_speed_mph} onChange={(e) => setDraft({ ...draft, avg_speed_mph: Number(e.target.value) })} className="w-full" aria-label="average speed" />
                </Field>
                <Field label="Turnaround" value={`${draft.turnaround_buffer_minutes} min`}>
                  <input type="range" min={0} max={240} step={15} value={draft.turnaround_buffer_minutes} onChange={(e) => setDraft({ ...draft, turnaround_buffer_minutes: Number(e.target.value) })} className="w-full" aria-label="turnaround buffer minutes" />
                </Field>
              </div>
              <label className="flex items-center gap-2 border-b border-rule px-4 py-3 text-[13px] text-ink-2">
                <input type="checkbox" checked={draft.count_pending_bids_against_capacity} onChange={(e) => setDraft({ ...draft, count_pending_bids_against_capacity: e.target.checked })} />
                Count outstanding bids against capacity (soft locks)
              </label>
              <div className="p-3">
                <Button tone="info" onClick={save} disabled={saving} className="w-full">
                  {saving ? 'Applying…' : 'Apply policy & re-grade board'}
                </Button>
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Decision ledger" subtitle="Every accept, bid, decline and deliberate pass: who, why, and what the board said." right={<Seg value={filter} onChange={setFilter} options={[['all', 'All'], ['autopilot', 'Auto-pilot'], ['dispatcher', 'Dispatcher']]} />} bodyClassName="p-0">
        {list.length === 0 ? (
          <div className="p-4">
            <Empty hint="Act on a load, or switch auto-pilot to execute.">No decisions yet.</Empty>
          </div>
        ) : (
          <ol className="max-h-[72vh] divide-y divide-rule overflow-y-auto">
            {list.map((d) => (
              <li key={d.id} className="animate-lay-down px-4 py-3 text-[13px]">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Stamp tone={actionTone[d.action] ?? 'neutral'}>{d.action}</Stamp>
                  <Tag tone={outcomeTone[d.outcome] ?? 'neutral'}>
                    {d.outcome}
                    {d.board_status_code && d.outcome === 'rejected' ? ` ${d.board_status_code}` : ''}
                  </Tag>
                  <Tag tone={d.actor === 'autopilot' ? 'accent' : 'neutral'}>{d.actor}</Tag>
                  {d.override && <Tag tone="warn">override</Tag>}
                  <span className="num font-condensed text-[14px] font-semibold uppercase tracking-[0.04em] text-ink">{d.external_id}</span>
                  <span className="num font-condensed text-[14px] font-semibold uppercase tracking-[0.04em] text-ink-3">{d.lane_id}</span>
                  <span className="label ml-auto normal-case tracking-[0.02em]">{fmtSim(d.sim_time, { date: true })} sim</span>
                </div>
                <div className="num mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-ink-3">
                  {d.bid_rate != null && <span>bid {money(d.bid_rate)}</span>}
                  {d.expected_margin != null && <span className={d.expected_margin < 0 ? 'text-red-ink' : 'text-green-ink'}>margin {money(d.expected_margin)}</span>}
                  {d.deadhead_miles != null && <span>{Math.round(d.deadhead_miles)} mi empty</span>}
                  {d.score != null && <span>score {Math.round(d.score)}</span>}
                </div>
                {d.message && <div className={cx('mt-1 leading-snug text-ink', d.outcome === 'rejected' && 'text-red-ink')}>{d.message}</div>}
                {d.reasons && d.reasons.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-[12px] leading-snug text-ink-2">
                    {d.reasons.slice(0, 3).map((r, i) => (
                      <li key={i} className="flex gap-1">
                        <ChevronRight size={13} className="mt-[2px] shrink-0 text-rule-2" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  )
}

function Field({ label, value, children, className }: { label: string; value: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx('border-b border-rule px-4 py-2.5', className)}>
      <div className="flex items-baseline justify-between">
        <span className="label">{label}</span>
        <span className="num font-condensed text-[15px] font-bold text-ink">{value}</span>
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

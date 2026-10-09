import { useEffect, useState } from 'react'
import { Bot, Play } from 'lucide-react'
import { api } from '../api'
import type { Decision, Policy } from '../types'
import { cx, fmtSim, money } from '../lib/format'
import { Badge, Button, Panel, type Tone } from './ui'
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
      toast.push(mode === 'execute' ? 'warn' : 'info', `Auto-pilot: ${mode}`, mode === 'execute' ? 'It will accept, bid and decline through the same guardrails you see on each card.' : mode === 'advise' ? 'Recommendations only; nothing is booked without a click.' : 'Dormant.')
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
      toast.push('success', 'Policy updated', 'Open loads were re-evaluated under the new rules.')
    } catch (e) {
      toast.push('error', 'Policy update failed', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const runOnce = async () => {
    try {
      const r = await api.runAutopilot()
      toast.push('info', 'Auto-pilot pass complete', Object.entries(r).map(([k, v]) => `${k} ${v}`).join(' · '))
    } catch (e) {
      toast.push('error', 'Auto-pilot run failed', (e as Error).message)
    }
  }

  const list = decisions.filter((d) => filter === 'all' || d.actor === filter)

  return (
    <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <div className="space-y-4">
        <Panel title={<span className="inline-flex items-center gap-2"><Bot size={14} className="text-violet-400" /> Auto-pilot</span>} subtitle="Books without a click — only when every guardrail passes">
          <div className="grid grid-cols-3 gap-1 rounded-md border border-slate-700 bg-slate-950 p-1">
            {(['off', 'advise', 'execute'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={cx('rounded px-2 py-1.5 text-xs font-medium transition', policy?.autopilot_mode === m ? (m === 'execute' ? 'bg-violet-600 text-white' : 'bg-slate-700 text-white') : 'text-slate-400 hover:text-slate-200')}>
                {m}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {policy?.autopilot_mode === 'execute' ? 'Executing: scores the open board every 2s, books the best feasible loads first, leaves borderline calls for you.' : policy?.autopilot_mode === 'advise' ? 'Advising: every card shows what it would do and why.' : 'Off.'}
          </p>
          {autopilot && (
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded bg-slate-950/60 py-1"><div className="font-mono text-slate-100">{autopilot.runs}</div><div className="text-[10px] text-slate-500">passes</div></div>
              <div className="rounded bg-slate-950/60 py-1"><div className="font-mono text-slate-100">{autopilot.actions}</div><div className="text-[10px] text-slate-500">actions</div></div>
              <div className="rounded bg-slate-950/60 py-1"><div className="font-mono text-slate-100">{autopilot.last_run_at ? new Date(autopilot.last_run_at).toLocaleTimeString() : '—'}</div><div className="text-[10px] text-slate-500">last pass</div></div>
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={runOnce} title="Run a single pass now (only acts in execute mode)">
              <Play size={12} /> run one pass
            </Button>
            <label className="flex items-center gap-1 text-[11px] text-slate-400">
              <input type="checkbox" checked={!!draft?.autopilot_auto_decline} onChange={(e) => draft && setDraft({ ...draft, autopilot_auto_decline: e.target.checked })} className="accent-violet-500" /> auto-decline clear losers
            </label>
          </div>
        </Panel>

        <Panel title="Dispatch policy" subtitle="Guardrails every accept / bid must clear (dispatcher can override, auto-pilot cannot)">
          {draft && (
            <div className="space-y-3 text-xs">
              <Field label="Minimum margin" value={money(draft.min_margin_usd)}>
                <input type="range" min={0} max={1000} step={25} value={draft.min_margin_usd} onChange={(e) => setDraft({ ...draft, min_margin_usd: Number(e.target.value) })} className="w-full accent-sky-500" />
              </Field>
              <Field label="Minimum margin %" value={`${Math.round(draft.min_margin_pct * 100)}%`}>
                <input type="range" min={0} max={40} step={1} value={Math.round(draft.min_margin_pct * 100)} onChange={(e) => setDraft({ ...draft, min_margin_pct: Number(e.target.value) / 100 })} className="w-full accent-sky-500" />
              </Field>
              <Field label="Max deadhead" value={`${draft.max_deadhead_miles} mi`}>
                <input type="range" min={25} max={400} step={5} value={draft.max_deadhead_miles} onChange={(e) => setDraft({ ...draft, max_deadhead_miles: Number(e.target.value) })} className="w-full accent-sky-500" />
              </Field>
              <Field label="Reserve units per hub" value={String(draft.reserve_units_per_terminal)}>
                <input type="range" min={0} max={4} step={1} value={draft.reserve_units_per_terminal} onChange={(e) => setDraft({ ...draft, reserve_units_per_terminal: Number(e.target.value) })} className="w-full accent-sky-500" />
              </Field>
              <Field label="Target bid margin" value={`${Math.round(draft.target_bid_margin_pct * 100)}%`}>
                <input type="range" min={5} max={50} step={1} value={Math.round(draft.target_bid_margin_pct * 100)} onChange={(e) => setDraft({ ...draft, target_bid_margin_pct: Number(e.target.value) / 100 })} className="w-full accent-sky-500" />
              </Field>
              <Field label="Chaining weight" value={draft.chain_weight.toFixed(2)}>
                <input type="range" min={0} max={1} step={0.05} value={draft.chain_weight} onChange={(e) => setDraft({ ...draft, chain_weight: Number(e.target.value) })} className="w-full accent-sky-500" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Avg speed" value={`${draft.avg_speed_mph} mph`}>
                  <input type="range" min={35} max={65} step={1} value={draft.avg_speed_mph} onChange={(e) => setDraft({ ...draft, avg_speed_mph: Number(e.target.value) })} className="w-full accent-sky-500" />
                </Field>
                <Field label="Turnaround buffer" value={`${draft.turnaround_buffer_minutes} min`}>
                  <input type="range" min={0} max={240} step={15} value={draft.turnaround_buffer_minutes} onChange={(e) => setDraft({ ...draft, turnaround_buffer_minutes: Number(e.target.value) })} className="w-full accent-sky-500" />
                </Field>
              </div>
              <label className="flex items-center gap-1.5 text-slate-300">
                <input type="checkbox" checked={draft.count_pending_bids_against_capacity} onChange={(e) => setDraft({ ...draft, count_pending_bids_against_capacity: e.target.checked })} className="accent-sky-500" />
                count outstanding bids against capacity (soft locks)
              </label>
              <Button tone="info" onClick={save} disabled={saving} className="w-full">
                {saving ? 'Saving…' : 'Apply policy & re-evaluate board'}
              </Button>
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Decision ledger"
        subtitle="Every accept, bid, decline and deliberate pass — who, why, and what the board said"
        right={
          <div className="inline-flex overflow-hidden rounded-md border border-slate-700 bg-slate-950 text-xs">
            {(['all', 'autopilot', 'dispatcher'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={cx('px-2 py-1', filter === f ? 'bg-slate-700 text-white' : 'text-slate-400')}>
                {f}
              </button>
            ))}
          </div>
        }
      >
        {list.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">No decisions yet.</div>
        ) : (
          <ul className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
            {list.map((d) => (
              <li key={d.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={d.actor === 'autopilot' ? 'accent' : 'neutral'}>{d.actor}</Badge>
                  <Badge tone={actionTone[d.action] ?? 'neutral'}>{d.action}</Badge>
                  <Badge tone={outcomeTone[d.outcome] ?? 'neutral'}>{d.outcome}{d.board_status_code && d.outcome === 'rejected' ? ` ${d.board_status_code}` : ''}</Badge>
                  {d.override && <Badge tone="warn">override</Badge>}
                  <span className="font-mono text-slate-300">{d.external_id}</span>
                  <span className="font-mono text-slate-500">{d.lane_id}</span>
                  <span className="ml-auto text-[10px] text-slate-500">{fmtSim(d.sim_time, { date: true })} sim</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                  {d.bid_rate != null && <span>bid {money(d.bid_rate)}</span>}
                  {d.expected_margin != null && <span className={d.expected_margin < 0 ? 'text-rose-300' : 'text-emerald-300'}>margin {money(d.expected_margin)}</span>}
                  {d.deadhead_miles != null && <span>{Math.round(d.deadhead_miles)} mi empty</span>}
                  {d.score != null && <span>score {Math.round(d.score)}</span>}
                </div>
                {d.message && <div className="mt-1 text-slate-300">{d.message}</div>}
                {d.reasons && d.reasons.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-[11px] text-slate-400">
                    {d.reasons.slice(0, 3).map((r, i) => (
                      <li key={i}>▸ {r}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function Field({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between text-slate-300">
        <span>{label}</span>
        <span className="font-mono text-slate-100">{value}</span>
      </div>
      {children}
    </div>
  )
}

import { Activity, Compass, PlugZap, Radio, Sparkles } from 'lucide-react'
import { api } from '../api'
import type { ClockSnap, IngestStatus, Policy } from '../types'
import { cx } from '../lib/format'
import { Badge, Button } from './ui'
import { useToast } from './Toast'

export function Header({ clock, simNow, ingest, policy, wsConnected, onRefresh }: { clock: ClockSnap | null; simNow: number; ingest: IngestStatus | null; policy: Policy | null; wsConnected: boolean; onRefresh: () => void }) {
  const toast = useToast()
  const d = new Date(simNow)
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC' })
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
  const speed = clock?.simulation_speed ?? 1
  const boardTone = !ingest?.board_reachable ? 'bad' : ingest.mode === 'websocket' ? 'good' : 'warn'

  const setSpeed = async (s: number) => {
    try {
      await api.setSpeed(s)
      toast.push('info', `Simulation speed ${s}×`, s === 1 ? 'Real time.' : `${(s / 60).toFixed(0)} sim minutes per wall second.`)
    } catch (e) {
      toast.push('error', 'Could not change speed', (e as Error).message)
    }
  }
  const spawn = async () => {
    try {
      await api.spawn(6)
      toast.push('success', 'Spawned 6 demo loads', 'The board emits new loads on its own interval; this just adds a burst.')
      onRefresh()
    } catch (e) {
      toast.push('error', 'Spawn failed', (e as Error).message)
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-lg shadow-sky-900/40">
            <Compass size={18} />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-wide text-slate-100">Lodestar</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">dispatch console</div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1">
          <div>
            <div className="font-mono text-lg tabular-nums leading-none text-slate-100">{time}</div>
            <div className="text-[10px] text-slate-500">
              {date} · sim time UTC · <span className={cx(speed > 1 ? 'text-amber-300' : 'text-slate-400')}>{speed}×</span>
            </div>
          </div>
          <div className="flex gap-0.5">
            {[1, 60, 300, 900].map((s) => (
              <button key={s} onClick={() => setSpeed(s)} className={cx('rounded px-1.5 py-0.5 text-[10px] font-mono transition', speed === s ? 'bg-amber-500/20 text-amber-300' : 'text-slate-500 hover:text-slate-200')} title={`Set board simulation speed to ${s}×`}>
                {s}×
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={boardTone} title={ingest?.last_error ?? `board ${ingest?.mode}`}>
            <Radio size={11} /> board {ingest ? (ingest.board_reachable ? ingest.mode : 'offline') : '…'}
          </Badge>
          <Badge tone={wsConnected ? 'good' : 'warn'} title="Lodestar → browser push channel">
            <PlugZap size={11} /> {wsConnected ? 'live' : 'polling'}
          </Badge>
          <Badge tone={policy?.autopilot_mode === 'execute' ? 'accent' : policy?.autopilot_mode === 'advise' ? 'info' : 'neutral'} title="Auto-pilot mode">
            <Sparkles size={11} /> auto-pilot {policy?.autopilot_mode ?? '…'}
          </Badge>
          {ingest && (
            <Badge tone="neutral" title={`${ingest.ws_events} socket events · ${ingest.poll_cycles} polls · ${ingest.board_restarts_detected} board restarts handled`}>
              <Activity size={11} /> {ingest.orders_seen} loads seen
            </Badge>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" onClick={spawn} title="Ask the board for a burst of new loads (demo helper)">
            + demo loads
          </Button>
        </div>
      </div>
    </header>
  )
}

import { Plus } from 'lucide-react'
import { api } from '../api'
import type { ClockSnap, IngestStatus, Policy } from '../types'
import { cx } from '../lib/format'
import { Button, Legend } from './ui'
import { useToast } from './Toast'

export function Header({ clock, simNow, ingest, policy, wsConnected, onRefresh }: { clock: ClockSnap | null; simNow: number; ingest: IngestStatus | null; policy: Policy | null; wsConnected: boolean; onRefresh: () => void }) {
  const toast = useToast()
  const d = new Date(simNow)
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC' })
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
  const speed = clock?.simulation_speed ?? 1
  const boardTone = !ingest ? 'neutral' : !ingest.board_reachable ? 'bad' : ingest.mode === 'websocket' ? 'good' : 'warn'

  const setSpeed = async (s: number) => {
    try {
      await api.setSpeed(s)
      toast.push('info', `Clock ${s}×`, s === 1 ? 'Real time. Open loads live 10 minutes.' : `${(s / 60).toFixed(0)} sim minutes per second — open loads expire in ${(600 / s).toFixed(0)}s, so book at 1× and speed up to watch deliveries.`)
    } catch (e) {
      toast.push('error', 'Could not change speed', (e as Error).message)
    }
  }
  const spawn = async () => {
    try {
      await api.spawn(6)
      toast.push('success', 'Six loads posted', 'The board keeps posting on its own interval; this adds a burst.')
      onRefresh()
    } catch (e) {
      toast.push('error', 'Could not post loads', (e as Error).message)
    }
  }

  return (
    <header className="z-30 border-b border-rule bg-paper md:sticky md:top-0">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 lg:px-6">
        <div className="flex items-center gap-2.5">
          <Mark />
          <div className="leading-none">
            <div className="font-condensed text-[22px] font-bold uppercase tracking-[0.12em] text-ink">Lodestar</div>
            <div className="label mt-1">Dispatch atlas</div>
          </div>
        </div>

        <div className="flex items-center gap-3 border-l border-rule pl-5">
          <div>
            <div className="num font-condensed text-[26px] font-bold leading-none tracking-[0.04em] text-ink" aria-label="simulation time">
              {time}
            </div>
            <div className="label mt-1">
              {date} · sim UTC · <span className={cx(speed > 1 ? 'text-yellow-ink' : 'text-ink-3')}>{speed}×</span>
            </div>
          </div>
          <div className="flex items-stretch overflow-hidden rounded-[3px] border border-rule-2" role="group" aria-label="simulation speed">
            {[1, 60, 300, 900].map((s, i) => (
              <button key={s} onClick={() => setSpeed(s)} className={cx('num px-2 font-condensed text-[12px] font-bold transition-colors duration-150', i > 0 && 'border-l border-rule-2', speed === s ? 'bg-ink text-paper-2' : 'text-ink-3 hover:bg-paper-3 hover:text-ink')} title={`Set the board's simulation speed to ${s}×`}>
                {s}×
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-l border-rule pl-5">
          <Legend tone={boardTone} pulse={boardTone === 'good'} title={ingest?.last_error ?? `board link: ${ingest?.mode}`}>
            board {ingest ? (ingest.board_reachable ? ingest.mode : 'offline') : '…'}
          </Legend>
          <Legend tone={wsConnected ? 'good' : 'warn'} title="Lodestar → console push channel">
            {wsConnected ? 'live feed' : 'polling'}
          </Legend>
          <Legend tone={policy?.autopilot_mode === 'execute' ? 'accent' : policy?.autopilot_mode === 'advise' ? 'info' : 'neutral'} title="auto-pilot mode">
            auto-pilot {policy?.autopilot_mode ?? '…'}
          </Legend>
          {ingest && (
            <Legend tone="neutral" title={`${ingest.ws_events} socket events · ${ingest.poll_cycles} polls · ${ingest.board_restarts_detected} board restarts handled`}>
              <span className="num">{ingest.orders_seen}</span> loads seen
            </Legend>
          )}
        </div>

        <div className="ml-auto">
          <Button size="sm" onClick={spawn} title="Ask the board for six new loads (demo helper)">
            <Plus size={13} /> post loads
          </Button>
        </div>
      </div>
    </header>
  )
}

/** The lodestar: a compass-rose star in route blue with a red north point. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cx('h-9 w-9', className)} role="img" aria-label="Lodestar">
      <circle cx="20" cy="20" r="18.5" fill="var(--color-paper-2)" stroke="var(--color-ink)" strokeWidth="1.5" />
      <circle cx="20" cy="20" r="13" fill="none" stroke="var(--color-rule-2)" strokeWidth="0.8" strokeDasharray="1.5 2" />
      <path d="M20 4 L23 17 L36 20 L23 23 L20 36 L17 23 L4 20 L17 17 Z" fill="var(--color-road)" />
      <path d="M20 4 L23 17 L20 20 L17 17 Z" fill="var(--color-red)" />
      <circle cx="20" cy="20" r="2" fill="var(--color-paper-2)" />
    </svg>
  )
}

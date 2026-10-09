import { useState } from 'react'
import { BarChart3, Bot, CalendarClock, LayoutList, Map } from 'lucide-react'
import { useLive } from './hooks/useLive'
import { useSimClock } from './hooks/useSimClock'
import { Header } from './components/Header'
import { LoadBoard } from './components/LoadBoard'
import { NetworkPanel } from './components/NetworkPanel'
import { SchedulePanel } from './components/SchedulePanel'
import { AutopilotPanel } from './components/AutopilotPanel'
import { AnalyticsPanel, KpiStrip } from './components/AnalyticsPanel'
import { ToastProvider } from './components/Toast'
import { cx } from './lib/format'

type Tab = 'board' | 'network' | 'schedule' | 'autopilot' | 'analytics'

const TABS: { id: Tab; label: string; icon: typeof LayoutList }[] = [
  { id: 'board', label: 'Load board', icon: LayoutList },
  { id: 'network', label: 'Network', icon: Map },
  { id: 'schedule', label: 'Schedule', icon: CalendarClock },
  { id: 'autopilot', label: 'Auto-pilot & policy', icon: Bot },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
]

function Console() {
  const live = useLive()
  const { simNow } = useSimClock(live.clock)
  const [tab, setTab] = useState<Tab>('board')
  const warnings = live.forecast?.warnings.filter((w) => w.level !== 'info').length ?? 0

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <Header clock={live.clock} simNow={simNow} ingest={live.ingest} policy={live.policy} wsConnected={live.wsConnected} onRefresh={live.refreshAll} />
      <nav className="border-b border-slate-800 bg-slate-950">
        <div className="mx-auto flex max-w-[1800px] gap-1 overflow-x-auto px-4">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)} className={cx('flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition', tab === id ? 'border-sky-400 text-slate-100' : 'border-transparent text-slate-400 hover:text-slate-200')}>
              <Icon size={14} />
              {label}
              {id === 'board' && live.open.length > 0 && <span className="rounded-full bg-slate-800 px-1.5 text-[10px] font-mono text-slate-300">{live.open.length}</span>}
              {id === 'network' && warnings > 0 && <span className="rounded-full bg-amber-500/20 px-1.5 text-[10px] font-mono text-amber-300">{warnings}</span>}
            </button>
          ))}
        </div>
      </nav>
      <main className="mx-auto max-w-[1800px] space-y-4 px-4 py-4">
        {tab !== 'analytics' && <KpiStrip kpis={live.kpis} />}
        {tab === 'board' && <LoadBoard open={live.open} active={live.active} history={live.history} simNow={simNow} onChanged={live.refreshShipments} />}
        {tab === 'network' && <NetworkPanel terminals={live.terminals} units={live.units} forecast={live.forecast} active={live.active} open={live.open} />}
        {tab === 'schedule' && <SchedulePanel simNow={simNow} terminals={live.terminals} refreshKey={`${live.lastEvent}-${live.active.length}-${Math.floor(simNow / 60000)}`} />}
        {tab === 'autopilot' && <AutopilotPanel policy={live.policy} decisions={live.decisions} autopilot={live.status?.autopilot ?? null} onPolicy={() => live.refreshStatus()} />}
        {tab === 'analytics' && <AnalyticsPanel kpis={live.kpis} />}
      </main>
      <footer className="mx-auto max-w-[1800px] px-4 pb-6 text-[11px] text-slate-600">
        Lodestar Dispatch · board {live.status?.board_url ?? '…'} · history {live.ingest?.history_rows ?? 0} rows ({live.ingest?.history_source ?? '…'})
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <Console />
    </ToastProvider>
  )
}

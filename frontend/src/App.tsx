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

const TABS: { id: Tab; label: string; short: string; icon: typeof LayoutList; tone: string }[] = [
  { id: 'board', label: 'Load board', short: 'Board', icon: LayoutList, tone: 'bg-road' },
  { id: 'network', label: 'Network', short: 'Map', icon: Map, tone: 'bg-green' },
  { id: 'schedule', label: 'Schedule', short: 'Log', icon: CalendarClock, tone: 'bg-yellow' },
  { id: 'autopilot', label: 'Auto-pilot & policy', short: 'Auto', icon: Bot, tone: 'bg-carbon' },
  { id: 'analytics', label: 'Analytics', short: 'Data', icon: BarChart3, tone: 'bg-red' },
]

function Console() {
  const live = useLive()
  const { simNow } = useSimClock(live.clock)
  const [tab, setTab] = useState<Tab>('board')
  const warnings = live.forecast?.warnings.filter((w) => w.level !== 'info').length ?? 0
  const counts: Partial<Record<Tab, number>> = { board: live.open.length, network: warnings }

  return (
    <div className="min-h-screen md:flex">
      {/* index-tab rail: the atlas' fore-edge tabs */}
      <nav className="sticky top-0 z-40 flex border-b border-rule bg-paper-3 md:h-screen md:w-[88px] md:shrink-0 md:flex-col md:border-b-0 md:border-r" aria-label="sections">
        <ul className="flex w-full md:mt-[104px] md:flex-col">
          {TABS.map(({ id, label, short, icon: Icon, tone }) => {
            const active = tab === id
            const n = counts[id]
            return (
              <li key={id} className="flex-1 md:flex-none">
                <button
                  onClick={() => setTab(id)}
                  aria-current={active ? 'page' : undefined}
                  title={label}
                  className={cx(
                    'group relative flex w-full flex-col items-center gap-1 py-2.5 transition-colors duration-150 md:py-4',
                    active ? 'bg-paper-2 text-ink md:-mr-px md:border-y md:border-rule' : 'text-ink-3 hover:bg-paper hover:text-ink',
                  )}
                >
                  <span className={cx('absolute left-0 top-0 h-0.5 w-full md:h-full md:w-1', active ? tone : 'bg-transparent')} />
                  <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                  <span className="font-condensed text-[12px] font-bold uppercase tracking-[0.1em]">{short}</span>
                  {n ? (
                    <span className={cx('num absolute right-2 top-1.5 rounded-[2px] px-1 font-condensed text-[10px] font-bold leading-4 md:right-2.5 md:top-2.5', id === 'network' ? 'bg-yellow text-ink' : 'bg-ink text-paper-2')}>
                      {n}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="min-w-0 flex-1">
        <Header clock={live.clock} simNow={simNow} ingest={live.ingest} policy={live.policy} wsConnected={live.wsConnected} onRefresh={live.refreshAll} />
        <main className="space-y-4 px-4 py-4 lg:px-6">
          {tab !== 'analytics' && <KpiStrip kpis={live.kpis} />}
          {tab === 'board' && <LoadBoard open={live.open} active={live.active} history={live.history} simNow={simNow} onChanged={live.refreshShipments} />}
          {tab === 'network' && <NetworkPanel terminals={live.terminals} units={live.units} forecast={live.forecast} active={live.active} open={live.open} />}
          {tab === 'schedule' && <SchedulePanel simNow={simNow} terminals={live.terminals} refreshKey={`${live.lastEvent}-${live.active.length}-${Math.floor(simNow / 60000)}`} />}
          {tab === 'autopilot' && <AutopilotPanel policy={live.policy} decisions={live.decisions} autopilot={live.status?.autopilot ?? null} onPolicy={() => live.refreshStatus()} />}
          {tab === 'analytics' && <AnalyticsPanel kpis={live.kpis} />}
        </main>
        <footer className="px-4 pb-6 pt-2 lg:px-6">
          <div className="label flex flex-wrap gap-x-4 gap-y-1">
            <span>Lodestar Dispatch</span>
            <span>board {live.status?.board_url ?? '…'}</span>
            <span>history {live.ingest?.history_rows ?? 0} rows · {live.ingest?.history_source ?? '…'}</span>
          </div>
        </footer>
      </div>
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

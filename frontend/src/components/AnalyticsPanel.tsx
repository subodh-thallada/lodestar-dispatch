import { useEffect, useState } from 'react'
import { api } from '../api'
import type { HistoryAnalytics, Kpis, ModelMetrics } from '../types'
import { money, pct } from '../lib/format'
import { Panel, Stat } from './ui'

export function KpiStrip({ kpis }: { kpis: Kpis | null }) {
  if (!kpis) return null
  const mt = kpis.booked_margin > 0 ? 'good' : kpis.booked_margin < 0 ? 'bad' : 'neutral'
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
      <Stat label="Booked margin" value={money(kpis.booked_margin)} sub={`${pct(kpis.booked_margin_pct)} of ${money(kpis.booked_revenue)}`} tone={mt} />
      <Stat label="Loads booked" value={kpis.booked_loads} sub={`${kpis.opportunities_seen} seen · ${kpis.declined_loads} declined`} />
      <Stat label="Empty-mile ratio" value={pct(kpis.empty_mile_ratio)} sub={`${Math.round(kpis.deadhead_miles)} / ${Math.round(kpis.loaded_miles)} mi`} tone={kpis.empty_mile_ratio != null && kpis.empty_mile_ratio > 0.1 ? 'warn' : 'good'} />
      <Stat label="Utilization" value={pct(kpis.utilization_now, 0)} sub={`${kpis.units_busy_now} / ${kpis.fleet_units} units busy`} tone="info" />
      <Stat label="Bids" value={`${kpis.bids_won}W · ${kpis.bids_lost}L`} sub={`${kpis.bids_pending} pending · ${money(kpis.bid_exposure_usd)} exposure`} tone="accent" />
      <Stat label="Avg margin / load" value={money(kpis.avg_margin_per_load)} sub={`${money(kpis.revenue_per_loaded_mile, 2)} per loaded mile`} />
      <Stat label="Losses avoided" value={money(kpis.losses_avoided_usd)} sub="declined negative-margin loads" tone="good" />
      <Stat label="Guardrail blocks" value={kpis.guardrail_blocks} sub={`${kpis.board_rejections} board 409s`} tone={kpis.board_rejections ? 'warn' : 'neutral'} />
    </div>
  )
}

export function AnalyticsPanel({ kpis }: { kpis: Kpis | null }) {
  const [hist, setHist] = useState<HistoryAnalytics | null>(null)
  const [model, setModel] = useState<ModelMetrics | null>(null)
  useEffect(() => {
    api.history().then(setHist).catch(() => undefined)
    api.model().then(setModel).catch(() => undefined)
  }, [])

  const lanes = hist?.lanes.slice(0, 18) ?? []
  const maxShip = Math.max(1, ...lanes.map((l) => l.shipments))

  return (
    <div className="space-y-4">
      <KpiStrip kpis={kpis} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Historical lanes" subtitle={hist ? `${hist.summary.rows} shipments · ${hist.summary.lanes} lanes · source ${hist.source}` : 'loading…'}>
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-1 pr-2">Lane</th>
                <th className="py-1 pr-2">Volume</th>
                <th className="py-1 pr-2 text-right">Market $/mi</th>
                <th className="py-1 pr-2 text-right">Cost $/mi</th>
                <th className="py-1 pr-2 text-right">Won margin</th>
                <th className="py-1 pr-2 text-right">BIN accept</th>
                <th className="py-1 pr-2 text-right">Bid win</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {lanes.map((l) => (
                <tr key={l.lane_id}>
                  <td className="py-1 pr-2 font-mono text-slate-200">{l.lane_id}</td>
                  <td className="py-1 pr-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded bg-slate-800">
                        <div className="h-full bg-sky-500" style={{ width: `${(l.shipments / maxShip) * 100}%` }} />
                      </div>
                      <span className="text-slate-400">{l.shipments}</span>
                    </div>
                  </td>
                  <td className="py-1 pr-2 text-right font-mono text-slate-200">{l.median_market_rpm.toFixed(2)}</td>
                  <td className="py-1 pr-2 text-right font-mono text-slate-400">{l.avg_cost_per_mile.toFixed(2)}</td>
                  <td className="py-1 pr-2 text-right font-mono text-emerald-300">{money(l.avg_margin_won)}</td>
                  <td className="py-1 pr-2 text-right font-mono text-slate-300">{pct(l.fixed_rate_accept_rate, 0)}</td>
                  <td className="py-1 pr-2 text-right font-mono text-slate-300">{pct(l.open_bid_win_rate, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <div className="space-y-4">
          <Panel title="Hub outbound value" subtitle="Avg realised margin on loads leaving each hub — drives the chaining term of the score">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
              {(hist?.hubs ?? []).map((h) => (
                <div key={h.hub} className="rounded-md bg-slate-950/60 px-2 py-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-slate-100">{h.hub}</span>
                    <span className="text-[10px] text-slate-500">{pct(h.volume_share, 0)} vol</span>
                  </div>
                  <div className="font-mono text-emerald-300">{money(h.outbound_value)}</div>
                  <div className="text-[10px] text-slate-500">{h.median_outbound_rpm.toFixed(2)} $/mi</div>
                </div>
              ))}
            </div>
            {hist && (
              <p className="mt-2 text-[11px] text-slate-400">
                Network average {money(hist.summary.network_outbound_value as number)} per won load. Fixed-rate accept rate {pct(hist.summary.fixed_rate_accept_rate as number, 0)}, open-bid win rate {pct(hist.summary.open_bid_win_rate as number, 0)}; only {hist.summary.won_loads_with_negative_margin} of {hist.summary.won_loads} won loads lost money after cost.
              </p>
            )}
          </Panel>

          <Panel title="Win-probability model" subtitle={model?.model}>
            {model && (
              <div className="grid gap-3 sm:grid-cols-[1fr_1.2fr]">
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Held-out AUC" value={model.auc.toFixed(3)} sub={`${model.test_rows} test rows`} tone="info" />
                  <Stat label="Brier" value={model.brier.toFixed(3)} sub={`log-loss ${model.log_loss.toFixed(3)}`} />
                  <Stat label="Base win rate" value={pct(model.base_rate, 0)} sub={`${model.rows} open-bid rows`} />
                  <Stat label="Bid gap coef." value={model.coefficients.gap?.toFixed(2)} sub="per σ above market" tone="accent" />
                </div>
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Calibration (predicted vs actual win rate)</div>
                  <div className="space-y-1">
                    {model.calibration.map((c) => (
                      <div key={c.bucket} className="flex items-center gap-2 text-[11px]">
                        <span className="w-14 font-mono text-slate-400">{c.bucket}</span>
                        <div className="relative h-3 flex-1 rounded bg-slate-800">
                          <div className="absolute inset-y-0 left-0 rounded bg-sky-500/60" style={{ width: `${c.predicted * 100}%` }} />
                          <div className="absolute inset-y-0 w-0.5 bg-emerald-400" style={{ left: `${c.actual * 100}%` }} />
                        </div>
                        <span className="w-20 font-mono text-slate-400">
                          {pct(c.predicted, 0)} / {pct(c.actual, 0)} <span className="text-slate-600">n{c.n}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">Bars: predicted · green tick: actual. Features: {model.features.join(', ')}.</p>
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}

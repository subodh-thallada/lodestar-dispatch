import { useEffect, useState } from 'react'
import { api } from '../api'
import type { HistoryAnalytics, Kpis, ModelMetrics } from '../types'
import { cx, money, pct } from '../lib/format'
import { Figure, Panel, Th } from './ui'

/** One ruled trip-summary line, the atlas' mileage-table idiom rather than a row of tiles. */
export function KpiStrip({ kpis }: { kpis: Kpis | null }) {
  if (!kpis) return <div className="h-[66px] border-y-2 border-ink/20" aria-hidden />
  return (
    <div className="grid grid-cols-2 gap-y-3 border-y-2 border-ink px-1 py-2.5 sm:grid-cols-4 xl:grid-cols-8 xl:gap-y-0 [&>*]:px-2.5 xl:[&>*+*]:border-l xl:[&>*+*]:border-rule">
      <Figure label="Booked margin" value={money(kpis.booked_margin)} sub={`${pct(kpis.booked_margin_pct)} of ${money(kpis.booked_revenue)}`} tone={kpis.booked_margin < 0 ? 'bad' : 'neutral'} />
      <Figure label="Loads booked" value={kpis.booked_loads} sub={`${kpis.opportunities_seen} seen · ${kpis.declined_loads} declined`} />
      <Figure label="Empty-mile ratio" value={pct(kpis.empty_mile_ratio)} sub={`${Math.round(kpis.deadhead_miles)} / ${Math.round(kpis.loaded_miles)} mi`} tone={kpis.empty_mile_ratio != null && kpis.empty_mile_ratio > 0.1 ? 'warn' : 'neutral'} />
      <Figure label="Utilization" value={pct(kpis.utilization_now, 0)} sub={`${kpis.units_busy_now} of ${kpis.fleet_units} units busy`} />
      <Figure label="Bids" value={`${kpis.bids_won}W · ${kpis.bids_lost}L`} sub={`${kpis.bids_pending} pending · ${money(kpis.bid_exposure_usd)} exposure`} />
      <Figure label="Avg margin / load" value={money(kpis.avg_margin_per_load)} sub={`${money(kpis.revenue_per_loaded_mile, 2)} per loaded mile`} />
      <Figure label="Losses avoided" value={money(kpis.losses_avoided_usd)} sub="declined negative-margin loads" />
      <Figure label="Guardrail holds" value={kpis.guardrail_blocks} sub={`${kpis.board_rejections} board 409s`} tone={kpis.board_rejections ? 'warn' : 'neutral'} />
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
        <Panel title="Historical lanes" subtitle={hist ? `${hist.summary.rows} shipments · ${hist.summary.lanes} lanes · ${hist.source}` : 'loading…'} bodyClassName="p-0">
          <table className="num w-full text-left text-[13px]">
            <thead className="border-b border-rule">
              <tr>
                <Th className="pl-4">Lane</Th>
                <Th>Volume</Th>
                <Th right>Market $/mi</Th>
                <Th right>Cost $/mi</Th>
                <Th right>Won margin</Th>
                <Th right>BIN accept</Th>
                <Th right className="pr-4">
                  Bid win
                </Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/70">
              {lanes.map((l) => (
                <tr key={l.lane_id} className="transition-colors duration-150 hover:bg-paper">
                  <td className="py-1.5 pl-4 pr-3 font-condensed text-[14px] font-bold uppercase tracking-[0.06em] text-ink">{l.lane_id}</td>
                  <td className="py-1.5 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden bg-paper-3">
                        <div className="h-full bg-road" style={{ width: `${(l.shipments / maxShip) * 100}%` }} />
                      </div>
                      <span className="text-ink-3">{l.shipments}</span>
                    </div>
                  </td>
                  <td className="py-1.5 pr-3 text-right text-ink">{l.median_market_rpm.toFixed(2)}</td>
                  <td className="py-1.5 pr-3 text-right text-ink-3">{l.avg_cost_per_mile.toFixed(2)}</td>
                  <td className="py-1.5 pr-3 text-right font-semibold text-green-ink">{money(l.avg_margin_won)}</td>
                  <td className="py-1.5 pr-3 text-right text-ink-2">{pct(l.fixed_rate_accept_rate, 0)}</td>
                  <td className="py-1.5 pr-4 text-right text-ink-2">{pct(l.open_bid_win_rate, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <div className="space-y-4">
          <Panel title="Hub outbound value" subtitle="Average realised margin on loads leaving each hub; this is the chaining term of the score." bodyClassName="p-0">
            <table className="num w-full text-left text-[13px]">
              <thead className="border-b border-rule">
                <tr>
                  <Th className="pl-4">Hub</Th>
                  <Th right>Outbound loads</Th>
                  <Th right>Volume</Th>
                  <Th right>$/mi</Th>
                  <Th right className="pr-4">
                    Outbound value
                  </Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule/70">
                {(hist?.hubs ?? []).map((h) => (
                  <tr key={h.hub}>
                    <td className="py-1.5 pl-4 pr-3 font-condensed text-[14px] font-bold uppercase tracking-[0.06em] text-ink">{h.hub}</td>
                    <td className="py-1.5 pr-3 text-right text-ink-2">{h.outbound_loads}</td>
                    <td className="py-1.5 pr-3 text-right text-ink-3">{pct(h.volume_share, 0)}</td>
                    <td className="py-1.5 pr-3 text-right text-ink-2">{h.median_outbound_rpm.toFixed(2)}</td>
                    <td className="py-1.5 pr-4 text-right font-semibold text-green-ink">{money(h.outbound_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hist && (
              <p className="border-t border-rule px-4 py-2.5 text-[12px] leading-snug text-ink-2">
                Network average {money(hist.summary.network_outbound_value as number)} per won load. Fixed-rate accept rate {pct(hist.summary.fixed_rate_accept_rate as number, 0)}, open-bid win rate {pct(hist.summary.open_bid_win_rate as number, 0)}; {hist.summary.won_loads_with_negative_margin} of {hist.summary.won_loads} won loads lost money after cost.
              </p>
            )}
          </Panel>

          <Panel title="Win-probability model" subtitle={model?.model}>
            {model && (
              <div className="grid gap-4 sm:grid-cols-[1fr_1.3fr]">
                <dl className="grid grid-cols-2 gap-x-3 gap-y-3 border-y border-rule py-2.5">
                  <Figure label="Held-out AUC" value={model.auc.toFixed(3)} sub={`${model.test_rows} test rows`} tone="info" />
                  <Figure label="Brier" value={model.brier.toFixed(3)} sub={`log-loss ${model.log_loss.toFixed(3)}`} />
                  <Figure label="Base win rate" value={pct(model.base_rate, 0)} sub={`${model.rows} open-bid auctions`} />
                  <Figure label="Bid-gap coef." value={model.coefficients.gap?.toFixed(2)} sub="per σ above market" tone="accent" />
                </dl>
                <div>
                  <div className="label">Calibration · predicted vs actual win rate</div>
                  <div className="mt-2 space-y-1.5">
                    {model.calibration.map((c) => (
                      <div key={c.bucket} className="num flex items-center gap-2 text-[12px]">
                        <span className="w-12 text-ink-3">{c.bucket}</span>
                        <div className="relative h-3 flex-1 bg-paper-3">
                          <div className="absolute inset-y-0 left-0 bg-road/70" style={{ width: `${c.predicted * 100}%` }} />
                          <div className="absolute inset-y-[-2px] w-0.5 bg-green" style={{ left: `${c.actual * 100}%` }} />
                        </div>
                        <span className={cx('w-28 whitespace-nowrap text-ink-2')}>
                          {pct(c.predicted, 0)} / {pct(c.actual, 0)} <span className="text-ink-3">n{c.n}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] leading-snug text-ink-3">Bar: predicted · green tick: actual. Features: {model.features.join(', ')}.</p>
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}

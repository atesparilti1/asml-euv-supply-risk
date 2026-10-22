import { C, CdfChart, FanChart, HistChart, LinesChart } from "../charts/charts";
import { Callout, Chapter, DataTable, Legend, Panel, StatTile } from "../components/ui";
import { describePolicy, R } from "../data";
import { eur, MONTHS, num, pct } from "../lib/format";

type S = typeof R.summary.none.stats.price;
const ROWS: [keyof typeof R.summary.none.stats, string, (x: number) => string][] = [
  ["price", "Value per share", (x) => eur(x)],
  ["ships", "EUV systems shipped 2027–30", (x) => num(x)],
  ["supply_shortfall", "Ordered systems not shipped by Dec 2030", (x) => pct(x)],
  ["ontime", "Systems shipped in the month due", (x) => pct(x)],
  ["delay", "Average delay per system (months)", (x) => num(x, 2)],
  ["rev_at_risk", "Ordered EUV revenue not shipped by Dec 2030 (€bn)", (x) => num(x, 1)],
  ["lost", "Orders cancelled (systems)", (x) => num(x, 1)],
];

export function Results() {
  const s0 = R.summary.none, s1 = R.summary.policy, ch = R.charts;
  const p = s0.stats.price;
  const ciLo = p.mean - 1.96 * p.se, ciHi = p.mean + 1.96 * p.se;
  const lateMax = Math.max(...ch.late_fan.none.p95, ...ch.late_fan.policy.p95) * 1.05;
  const series = [{ label: "No buffer", color: C.s1 }, { label: "Recommended buffers", color: C.s2 }];
  const th = s0.thresholds;
  return (
    <Chapter id="results" n="04" kicker="Results" title="What 20,000 versions of 2027–2030 look like"
      lede={<>Valuation uncertainty is dominated by demand: the spread of value per share is ±€{((p.p95 - p.p5) / 2).toFixed(0)} around the median,
        and the buffer policy moves it by cents. The supply chain shows up where operations feel it. With no buffer, about {pct(1 - s0.stats.ontime.mean, 0)} of
        systems ship at least a month late, and one path in {Math.round(1 / th.supply_shortfall_above_5pct.p)} leaves more than 5% of four years' orders unshipped.</>}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Mean value per share" value={eur(p.mean, 1)} note={`median ${eur(p.median)} · DCF base ${eur(R.meta.base_price, 1)}`} />
        <StatTile label="P(value below DCF base)" value={pct(th.price_below_base.p)} note={`± ${pct(th.price_below_base.se * 1.96)} · the mean sits above the median (right skew)`} />
        <StatTile label="P(shipments < 90% of plan)" value={pct(th.ships_below_90pct_plan.p)} note="demand and supply combined" />
        <StatTile label="P(on-time delivery < 80%)" value={pct(th.ontime_below_80pct.p)} note={`${pct(s1.thresholds.ontime_below_80pct.p)} with recommended buffers`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Distribution of value per share" sub="Share of paths per €-bin. The two policies nearly coincide: buffers are not a valuation lever." aside={<Legend items={series} />}>
          <HistChart edges={ch.price_hist.none.edges} xFmt={(x) => eur(x)} refs={[{ x: R.meta.base_price, label: "DCF base" }]}
            series={[{ ...series[0], counts: ch.price_hist.none.counts }, { ...series[1], counts: ch.price_hist.policy.counts }]} />
        </Panel>
        <Panel title="Cumulative probability of value per share" sub="Read across: the share of paths at or below any value. Market price €1,611 lies beyond every path." aside={<Legend items={series} />}>
          <CdfChart xFmt={(x) => eur(x)} refs={[{ x: R.meta.base_price, label: "DCF base" }]}
            series={[{ ...series[0], ...ch.price_cdf.none }, { ...series[1], ...ch.price_cdf.policy }]} />
        </Panel>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="data min-w-[820px]">
          <thead>
            <tr><th>Outcome (no buffer · <span className="text-ink">with recommended buffers</span>)</th><th className="r">Mean</th><th className="r">SD</th><th className="r">P5</th><th className="r">P25</th><th className="r">Median</th><th className="r">P75</th><th className="r">P95</th></tr>
          </thead>
          <tbody>
            {ROWS.map(([k, label, f]) => {
              const a = s0.stats[k] as S, b = s1.stats[k] as S;
              return (
                <tr key={k}>
                  <td className="font-medium">{label}</td>
                  {(["mean", "sd", "p5", "p25", "median", "p75", "p95"] as const).map((q) => (
                    <td key={q} className="r"><span className="text-muted">{f(a[q])}</span><br /><span>{f(b[q])}</span></td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-faint">Recommended buffers: {describePolicy(R.policy.buffers)}. {R.meta.n_paths.toLocaleString("en-GB")} paths, seed {R.meta.seed}, common random numbers across policies.</p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title="Late EUV orders over time, no buffer" sub="Systems past their due month (NXE + EXE). Bands: 5–95th and 25–75th percentile; line: median; dashed: mean.">
          <FanChart fan={ch.late_fan.none} color={C.s1} labels={MONTHS} yFmt={(v) => num(v, 0)} yMax={lateMax} yLabel="systems late" />
        </Panel>
        <Panel title="Late EUV orders over time, recommended buffers" sub="Same random paths, same scale. The buffer trims the typical backlog; the tail comes from capacity and long outages.">
          <FanChart fan={ch.late_fan.policy} color={C.s2} labels={MONTHS} yFmt={(v) => num(v, 0)} yMax={lateMax} yLabel="systems late" />
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="Share of paths with an outage in progress" sub="By supplier and month. The level is set by the rates; the wiggle comes from shared stress."
          aside={<Legend items={[{ label: "Optics", color: C.s1 }, { label: "Light source", color: C.s2 }, { label: "Drive laser", color: C.s3 }]} />}>
          <LinesChart x={ch.months} xFmt={(v) => MONTHS[Math.round(v)]} yFmt={(v) => pct(v, 1)} h={200}
            series={[{ label: "Optics", color: C.s1, y: ch.down_share.optics }, { label: "Light source", color: C.s2, y: ch.down_share.source }, { label: "Drive laser", color: C.s3, y: ch.down_share.laser }]} />
          <DataTable>
            <table className="data"><thead><tr><th>Year</th><th className="r">Plan NXE</th><th className="r">Orders NXE (mean)</th><th className="r">Shipped NXE P5 / median / P95</th><th className="r">Plan EXE</th><th className="r">Shipped EXE P5 / median / P95</th></tr></thead>
              <tbody>{[0, 1, 2, 3].map((y) => (
                <tr key={y}><td>{2027 + y}</td><td className="r">{ch.ships_by_year.NXE.plan[y]}</td><td className="r">{num(ch.ships_by_year.NXE.orders[y], 1)}</td>
                  <td className="r">{ch.ships_by_year.NXE.none.p5[y]} / {ch.ships_by_year.NXE.none.p50[y]} / {ch.ships_by_year.NXE.none.p95[y]}</td>
                  <td className="r">{ch.ships_by_year.EXE.plan[y]}</td>
                  <td className="r">{ch.ships_by_year.EXE.none.p5[y]} / {ch.ships_by_year.EXE.none.p50[y]} / {ch.ships_by_year.EXE.none.p95[y]}</td></tr>
              ))}</tbody></table>
          </DataTable>
        </Panel>
        <div className="grid content-start gap-4">
          <Callout title="Two different intervals, in everyday language">
            <strong className="text-ink">Where outcomes can land:</strong> in 90% of simulated futures the value per share falls between{" "}
            {eur(p.p5)} and {eur(p.p95)}. That is a statement about the world, and more simulation will not narrow it.
            <br /><br />
            <strong className="text-ink">How precisely the average is known:</strong> the mean is {eur(p.mean, 1)} with a 95% confidence
            interval of {eur(ciLo, 1)} to {eur(ciHi, 1)}. That is a statement about the simulation's own sampling error, and it shrinks
            with the square root of the number of paths.
          </Callout>
          <Callout title="Downside tail">
            The worst 5% of paths average {eur(p.cvar5_low)} a share (CVaR), about {pct(1 - p.cvar5_low / p.mean, 0)} below the mean. Those
            are demand downturns. In the worst 5% of paths for supply, more than €{num(s0.stats.rev_at_risk.p95, 1)}bn of ordered EUV revenue is not shipped by the end of 2030.
          </Callout>
        </div>
      </div>
    </Chapter>
  );
}

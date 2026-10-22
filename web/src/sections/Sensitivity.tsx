import { useState } from "react";
import { BarList, C, TornadoChart } from "../charts/charts";
import { Callout, Chapter, DataTable, Legend, Panel, Segmented } from "../components/ui";
import { R } from "../data";
import { eur, num, pct, signedM } from "../lib/format";

type Metric = "policy_value" | "supply_shortfall" | "price";
const METRIC: Record<Metric, { label: string; fmt: (x: number) => string; dfmt: (x: number) => string }> = {
  policy_value: { label: "Value of recommended buffers", fmt: (x) => signedM(x), dfmt: (x) => signedM(x, 1) },
  supply_shortfall: { label: "Orders unshipped by 2030", fmt: (x) => pct(x, 1), dfmt: (x) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(2)} pts` },
  price: { label: "Mean value per share", fmt: (x) => eur(x, 1), dfmt: (x) => `${x >= 0 ? "+" : "−"}€${Math.abs(x).toFixed(2)}` },
};
const fmtParam = (unit: string, v: number) => (unit === "share" ? pct(v, 1) : unit === "per month" ? pct(v, 2) : num(v, v < 1 ? 3 : 2));

export function Sensitivity() {
  const [metric, setMetric] = useState<Metric>("policy_value");
  const [gmetric, setGmetric] = useState<Metric>("policy_value");
  const t = R.tornado;
  const rows = t.rows.map((r) => ({ label: r.label, lo: r.lo[metric], hi: r.hi[metric], loNote: fmtParam(r.unit, r.lo_value), hiNote: fmtParam(r.unit, r.hi_value) }))
    .sort((a, b) => Math.abs(b.hi - b.lo) - Math.abs(a.hi - a.lo));
  const g = R.global[gmetric];
  const top = t.rows.map((r) => ({ label: r.label, range: Math.abs(r.hi.policy_value - r.lo.policy_value) })).sort((a, b) => b.range - a.range);
  const split = R.split;
  return (
    <Chapter id="sensitivity" n="06" kicker="Sensitivity" title="Which assumptions the decision rests on"
      lede={<>Each prior is fixed in turn at its 10th and then its 90th percentile. Everything else stays random, including the shared stress
        factor, so dependence is kept rather than switched off. All runs share the same 20,000 random paths. The decision metric is most
        sensitive to <strong className="text-ink">{top[0].label}</strong> and <strong className="text-ink">{top[1].label}</strong>.
        Those are where better data would pay off most.</>}>
      <Panel title="Tornado: one assumption at a time" sub="Bars show the change from the central result when the assumption sits at its P10 or P90."
        aside={<div className="flex flex-wrap items-center gap-3"><Legend items={[{ label: "assumption at P10", color: C.s1 }, { label: "at P90", color: C.s2 }]} />
          <Segmented label="Tornado metric" value={metric} onChange={setMetric} options={[{ value: "policy_value", label: "Buffer value" }, { value: "supply_shortfall", label: "Shortfall" }, { value: "price", label: "Price" }]} /></div>}>
        <TornadoChart rows={rows} base={t.base[metric]} fmt={METRIC[metric].fmt} deltaFmt={METRIC[metric].dfmt} />
        <DataTable>
          <table className="data"><thead><tr><th>Assumption</th><th className="r">P10 value</th><th className="r">Result</th><th className="r">P90 value</th><th className="r">Result</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td><td className="r">{r.loNote}</td><td className="r">{METRIC[metric].fmt(r.lo)}</td><td className="r">{r.hiNote}</td><td className="r">{METRIC[metric].fmt(r.hi)}</td></tr>)}</tbody></table>
        </DataTable>
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Global view: share of variance explained by each input" sub={<>First-order index <span className="mono">S₁ = Var(E[Y|X]) / Var(Y)</span> from 25 quantile bins, over parameters and the random drivers realised on each path. Rank-regression R² = {g.r2_rank.toFixed(2)}.</>}
          aside={<Segmented label="Global metric" value={gmetric} onChange={setGmetric} options={[{ value: "policy_value", label: "Buffer value" }, { value: "supply_shortfall", label: "Shortfall" }, { value: "price", label: "Price" }]} />}>
          <BarList rows={g.rows.slice(0, 10).map((r) => ({ label: r.label, value: r.s1, note: `rank-regression coefficient ${r.srrc.toFixed(2)}` }))} fmt={(v) => pct(v, 1)} />
          <DataTable>
            <table className="data"><thead><tr><th>Input</th><th className="r">S₁</th><th className="r">Rank-regression coefficient</th></tr></thead>
              <tbody>{g.rows.map((r) => <tr key={r.name}><td>{r.label}</td><td className="r">{pct(r.s1, 2)}</td><td className="r">{r.srrc.toFixed(3)}</td></tr>)}</tbody></table>
          </DataTable>
        </Panel>
        <div className="grid content-start gap-4">
          <Callout title="Reading it">
            Value per share is about demand: the realised 2030 demand multiplier explains about {pct(R.global.price.rows[0].s1, 0)} of its variance, because it
            anchors the terminal value. Unshipped orders are about demand and outage months together. The value of the buffer is
            about <em>which</em> supplier fails: realised laser outage months explain the most, which is why the recommended policy holds lasers.
          </Callout>
          <Panel title="Parameter uncertainty vs randomness" sub="Share of each outcome's variance that disappears when the priors are fixed at their means.">
            <BarList rows={[
              { label: "Value per share", value: split.param_share_of_variance.price },
              { label: "Orders unshipped by 2030", value: split.param_share_of_variance.supply_shortfall },
              { label: "Ordered revenue not shipped", value: split.param_share_of_variance.rev_at_risk },
              { label: "On-time delivery", value: split.param_share_of_variance.ontime },
            ]} fmt={(v) => pct(v, 0)} color={C.s3} max={1} />
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Most of the spread is randomness that better data cannot remove. Parameter uncertainty matters most for how many orders go unshipped
              ({pct(split.param_share_of_variance.supply_shortfall, 0)} of its variance). Narrowing the supplier priors would sharpen the operational forecast more than the valuation.
            </p>
          </Panel>
        </div>
      </div>
    </Chapter>
  );
}

import { C, HistChart, LinesChart } from "../charts/charts";
import { Callout, Chapter, DataTable, Legend, Panel } from "../components/ui";
import { describePolicy, R } from "../data";
import { num, pct, signedM } from "../lib/format";

export function Decision() {
  const uni = R.uniform, pv = R.policy_value, s1 = R.summary.policy.stats;
  const ks = uni.map((u) => u.k);
  const brk = R.breakeven;
  const crossing = brk.find((b) => b.uniform2 > 0);
  return (
    <Chapter id="decision" n="05" kicker="The buffer decision" title="Buffer what is cheap and fragile, not what is expensive"
      lede={<>Holding the same number of spare sets of every module loses value at every level tried. An optics set costs about
        €40m (NXE) or €64m (EXE) and Zeiss rarely fails, so the cash it ties up earns less than the delays it prevents. A drive
        laser costs €7m and fails more often, so a few spares pay for themselves. Coordinate descent over all six buffer levels lands on{" "}
        <strong className="text-ink">{describePolicy(R.policy.buffers)}</strong>.</>}>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Equity value of holding k spare sets of every module" sub="Change vs no buffer, € millions, with 95% confidence band (paired paths).">
          <LinesChart x={ks} xFmt={(v) => `${v} set${v === 1 ? "" : "s"}`} yFmt={(v) => signedM(v)} zero
            series={[{ label: "Value vs no buffer", color: C.s1, dots: true, y: uni.map((u) => u.delta.mean), band: [uni.map((u) => u.delta.ci95[0]), uni.map((u) => u.delta.ci95[1])] }]} />
        </Panel>
        <Panel title="On-time delivery with k spare sets of every module" sub="Share of systems shipped in the month they were due.">
          <LinesChart x={ks} xFmt={(v) => `${v} set${v === 1 ? "" : "s"}`} yFmt={(v) => pct(v, 0)}
            series={[{ label: "On-time delivery", color: C.s1, dots: true, y: uni.map((u) => u.ontime) }]} />
        </Panel>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="data min-w-[720px]">
          <thead><tr><th>Policy</th><th className="r">Stock held</th><th className="r">Equity value vs none</th><th className="r">95% CI</th><th className="r">On-time</th><th className="r">Avg delay</th><th className="r">Orders lost</th></tr></thead>
          <tbody>
            {uni.map((u) => (
              <tr key={u.k}><td>{u.k === 0 ? "No buffer" : `${u.k} spare set${u.k > 1 ? "s" : ""} of everything`}</td><td className="r">€{num(u.buffer_value)}m</td>
                <td className="r">{signedM(u.delta.mean, 1)}</td><td className="r">{u.k ? `${signedM(u.delta.ci95[0])} to ${signedM(u.delta.ci95[1])}` : "–"}</td>
                <td className="r">{pct(u.ontime)}</td><td className="r">{num(u.delay, 2)} mo</td><td className="r">{num(u.lost, 2)}</td></tr>
            ))}
            <tr className="font-medium"><td>Recommended: {describePolicy(R.policy.buffers)}</td><td className="r">€{num(R.policy.value)}m</td>
              <td className="r text-good">{signedM(pv.mean, 1)}</td><td className="r">{signedM(pv.ci95[0])} to {signedM(pv.ci95[1])}</td>
              <td className="r">{pct(s1.ontime.mean)}</td><td className="r">{num(s1.delay.mean, 2)} mo</td><td className="r">{num(s1.lost.mean, 2)}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title="The recommended buffer works like insurance" sub={`Change in equity value per path, € millions. It costs money in ${pct(1 - pv.p_better, 0)} of paths (calm years) and pays off heavily in the disrupted ones.`}>
          <HistChart edges={R.charts.delta_hist.edges} xFmt={(v) => signedM(v)} refs={[{ x: 0, label: "break-even" }]}
            series={[{ label: "Recommended vs none", color: C.s2, counts: R.charts.delta_hist.counts }]} />
        </Panel>
        <Panel title="When do uniform buffers start to pay?" sub="Value vs no buffer as waiting customers cancel more often (central assumption 0.5% a month)."
          aside={<Legend items={[{ label: "Recommended", color: C.s2 }, { label: "2 sets of everything", color: C.s1 }]} />}>
          <LinesChart x={brk.map((b) => b.hazard * 100)} xFmt={(v) => `${num(v, v < 1 ? 2 : 0)}%`} yFmt={(v) => signedM(v)} zero
            series={[{ label: "Recommended", color: C.s2, dots: true, y: brk.map((b) => b.policy) }, { label: "2 sets of everything", color: C.s1, dots: true, y: brk.map((b) => b.uniform2) }]} />
          <DataTable>
            <table className="data"><thead><tr><th className="r">Cancellation hazard</th><th className="r">Orders lost (no buffer)</th><th className="r">Recommended</th><th className="r">2 sets</th></tr></thead>
              <tbody>{brk.map((b) => <tr key={b.hazard}><td className="r">{pct(b.hazard, 2)}/mo</td><td className="r">{num(b.lost_units, 1)}</td><td className="r">{signedM(b.policy, 1)}</td><td className="r">{signedM(b.uniform2, 1)}</td></tr>)}</tbody></table>
          </DataTable>
        </Panel>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Callout title="Fitted on one seed, judged on another">
          The optimiser searched {R.policy.fit.evaluations} candidate policies on seed 99 (8,000 paths). The value above is measured on
          the independent main seed, which avoids flattering the winner (the optimiser's curse). A refit on seed 101 picked{" "}
          {describePolicy(R.policy.refit.buffers)}. Only the second NXE light source differs, and the value surface is flat there.
        </Callout>
        <Callout title="What the market cares about">
          Whatever the policy, supply-chain risk costs about €{(R.supply_risk.none.mean / 1000).toFixed(2)}bn of equity value (€{R.supply_risk.none.per_share.toFixed(2)} a share)
          compared with a supply chain that never fails. Against a €620bn company that is small. The recommended buffers win back
          €{R.policy_value.mean.toFixed(0)}m of it.
        </Callout>
        <Callout title="When the answer flips">
          {crossing
            ? <>Two spare sets of everything only beat no buffer once customers cancel about {pct(crossing.hazard, 0)} of waiting orders a month,
              {" "}{num(crossing.hazard / 0.005, 0)}× the central assumption. That would describe a world where ASML had a credible competitor.</>
            : <>Within the hazards tested, uniform buffers never beat no buffer.</>}
        </Callout>
      </div>
    </Chapter>
  );
}

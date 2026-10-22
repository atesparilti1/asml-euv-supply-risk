import { C, LinesChart } from "../charts/charts";
import { Callout, Chapter, Panel } from "../components/ui";
import { R } from "../data";
import { eur, num, pct, signedM } from "../lib/format";

const CHECKS = [
  ["Deterministic reproduction", "With outages off, yields at 100%, ample capacity and demand at plan, every path ships exactly the DCF plan, and the value equals the original DCF's €935.30 to 12 significant digits. A test also runs the original repository's model and compares year by year."],
  ["Hand calculation", "A three-month example with an 80% optics outage in month 2 (table on the right) is worked by hand and asserted step by step, with and without one spare optics set."],
  ["Accounting identities", "On every path: orders = shipped + cancelled + still late, and module stock = buffer + good output − modules used. Stock and backlog are never negative, and on-time shipments never exceed orders."],
  ["Boundary conditions", "Zero capacity ships nothing and leaves every order late or cancelled. More buffer never lowers on-time delivery on common random numbers. Delaying one system from Dec 2030 into 2031 costs only its time value, far less than its price."],
  ["Building blocks", "The vectorised inverse binomial matches SciPy, the stress factor has unit variance at every month, the same seed reproduces every number, and invalid inputs fail with a message that says what to change."],
  ["Two independent implementations", "The browser engine (TypeScript, different random-number generator) agrees with the Python reference within four standard errors on price, unshipped orders, on-time delivery, delay and buffer value."],
];

export function Validation() {
  const conv = R.convergence, tr = conv.trace;
  const n = tr.map((t) => t.n);
  return (
    <Chapter id="validation" n="07" kicker="Validation" title="Checks the model has to pass before its answers count"
      lede={<>22 Python tests and 9 browser tests run on every build. They cover a hand-worked example, the deterministic case, the
        accounting identities and the edge cases. Beyond tests: do more paths change the answer, and do other plausible distributions or
        dependence assumptions change the conclusion?</>}>
      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <ol className="grid gap-3">
          {CHECKS.map(([t, d], i) => (
            <li key={t} className="grid grid-cols-[2rem_1fr] gap-2 border-b border-line pb-3">
              <span className="mono text-xs text-good">✓ {i + 1}</span>
              <div><p className="text-sm font-medium">{t}</p><p className="mt-1 text-xs leading-relaxed text-muted">{d}</p></div>
            </li>
          ))}
        </ol>
        <Panel title="Hand calculation (test_hand_calculation_*)" sub="2 NXE due per month, 3 integration bays, yields 100%. Optics capacity 3.3/month drops to 0.66 in month 2.">
          <table className="data">
            <thead><tr><th>Month</th><th className="r">Optics made</th><th className="r">Built</th><th className="r">Optics stock after</th><th className="r">Late</th></tr></thead>
            <tbody>
              <tr><td colSpan={5} className="text-muted">With 1 spare optics set</td></tr>
              <tr><td>1</td><td className="r">2</td><td className="r">2</td><td className="r">1</td><td className="r">0</td></tr>
              <tr><td>2 (outage)</td><td className="r">1</td><td className="r">2</td><td className="r">0</td><td className="r">0</td></tr>
              <tr><td>3</td><td className="r">3</td><td className="r">2</td><td className="r">1</td><td className="r">0</td></tr>
              <tr><td colSpan={5} className="text-muted">No spare</td></tr>
              <tr><td>1</td><td className="r">2</td><td className="r">2</td><td className="r">0</td><td className="r">0</td></tr>
              <tr><td>2 (outage)</td><td className="r">1</td><td className="r">1</td><td className="r">0</td><td className="r">1</td></tr>
              <tr><td>3</td><td className="r">3</td><td className="r">3</td><td className="r">0</td><td className="r">0</td></tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs leading-relaxed text-muted">Month 2 capacity credit: min(1.3 carried + 0.66, 0.66 + 1) = 1.66, so 1 optics set is started. With a spare, the
            month-2 build still completes and the spare is rebuilt in month 3. Without it, one system ships a month late.</p>
        </Panel>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title="Convergence: value of the recommended buffers" sub={`Running mean ± 1.96 standard errors on ${num(n[n.length - 1])} fresh paths (seed ${conv.compare.seed[1]}).`}>
          <LinesChart x={n} log xFmt={(v) => num(v)} yFmt={(v) => signedM(v)}
            series={[{ label: "Running mean", color: C.s2, y: tr.map((t) => t.policy_value), band: [tr.map((t) => t.policy_value - 1.96 * t.policy_value_se), tr.map((t) => t.policy_value + 1.96 * t.policy_value_se)] }]} />
        </Panel>
        <Panel title="Convergence: P(more than 5% of orders unshipped)" sub="Same fresh paths, no buffer.">
          <LinesChart x={n} log xFmt={(v) => num(v)} yFmt={(v) => pct(v, 0)}
            series={[{ label: "Running estimate", color: C.s1, y: tr.map((t) => t.p_short), band: [tr.map((t) => t.p_short - 1.96 * t.p_short_se), tr.map((t) => t.p_short + 1.96 * t.p_short_se)] }]} />
        </Panel>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="data min-w-[640px]">
          <thead><tr><th>Run</th><th className="r">Mean value / share</th><th className="r">P(&gt;5% unshipped)</th><th className="r">Value of recommended buffers</th><th className="r">Best uniform level</th></tr></thead>
          <tbody>{[0, 1].map((i) => (
            <tr key={i}><td>{num(conv.compare.n[i])} paths, seed {conv.compare.seed[i]}</td><td className="r">{eur(conv.compare.price_mean[i], 2)}</td>
              <td className="r">{pct(conv.compare.p_short[i])}</td><td className="r">{signedM(conv.compare.policy_value[i], 1)} ± {(1.96 * conv.compare.policy_value_se[i]).toFixed(1)}</td>
              <td className="r">{conv.compare.best_uniform_k[i]} set{conv.compare.best_uniform_k[i] === 1 ? "" : "s"}</td></tr>
          ))}</tbody>
        </table>
        <p className="mt-2 text-xs text-faint">Doubling the paths and changing the seed moves the buffer value by a few million euros, and the decision (buffer lasers and sources, not uniformly) does not change.</p>
      </div>

      <h3 className="mt-12 text-lg font-semibold">Alternative distributions and dependence</h3>
      <div className="mt-4 overflow-x-auto">
        <table className="data min-w-[760px]">
          <thead><tr><th>Assumption set</th><th className="r">Mean value / share</th><th className="r">Orders unshipped</th><th className="r">P(&gt;5% unshipped)</th><th className="r">Value of recommended buffers</th><th className="r">Best uniform level</th></tr></thead>
          <tbody>{R.alternatives.map((a) => (
            <tr key={a.label}><td className="font-medium">{a.label}</td><td className="r">{eur(a.price.mean, 1)}</td><td className="r">{pct(a.supply_shortfall, 2)}</td>
              <td className="r">{pct(a.p_short)}</td><td className="r">{signedM(a.policy.mean, 1)} ± {(1.96 * a.policy.se).toFixed(1)}</td><td className="r">{a.best_uniform_k} set{a.best_uniform_k === 1 ? "" : "s"}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Callout title="Dependence changes the decision; the distribution shape does not">
          Swapping lognormal for gamma outage durations (same mean and variance) barely moves anything. Removing the shared stress factor cuts
          the buffer's value from {signedM(R.alternatives[0].policy.mean)} to {signedM(R.alternatives[2].policy.mean)}. Doubling it raises the value to {signedM(R.alternatives[3].policy.mean)}, and then one
          spare set of everything starts to pay. Buffers are worth holding because failures cluster, so the strength of that clustering is the assumption to research first.
        </Callout>
        <Callout title="Unrealistic outputs looked for and not found">
          No path ships more than it was ordered or holds negative stock. Values per share range from €637 to €1,559, inside the DCF's
          Bear (€478) and Bull (€1,587) cases. The worst path leaves 44% of orders unshipped after a long outage on top of a weak capacity
          ramp, which is extreme but possible. No path reaches the €1,611 market price, so supply risk cannot be what separates the DCF from the market.
        </Callout>
      </div>
    </Chapter>
  );
}

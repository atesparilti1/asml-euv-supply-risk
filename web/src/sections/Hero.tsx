import { StatTile } from "../components/ui";
import { describePolicy, R } from "../data";
import { eur, pct, signedM } from "../lib/format";

export function Hero() {
  const pv = R.policy_value, risk = R.supply_risk.none, u2 = R.uniform.find((u) => u.k === 2)!;
  const s0 = R.summary.none.stats, s1 = R.summary.policy.stats;
  return (
    <header className="mx-auto max-w-6xl px-4 pb-14 pt-12 sm:px-6 md:pb-20 md:pt-20">
      <p className="mono text-xs text-faint">Monte Carlo · supply chain · valuation</p>
      <h1 className="display mt-4 max-w-4xl text-4xl font-semibold sm:text-6xl">
        How much spare stock of critical EUV modules should ASML hold?
      </h1>
      <p className="mt-6 max-w-3xl text-[15px] leading-relaxed text-muted sm:text-base">
        Every EUV system needs projection optics from Zeiss, a light source from Cymer and a drive laser from Trumpf. Each is a single
        source. I simulate {R.meta.n_paths.toLocaleString("en-GB")} versions of 2027–2030: supplier outages, failed qualifications,
        capacity ramps that fall short and demand cycles that move together. Every path then runs through{" "}
        <a className="text-ink underline decoration-line underline-offset-4 hover:decoration-accent" href="https://atesparilti1.github.io/asml-dcf-valuation/">my ASML DCF</a>{" "}
        to price each buffer policy in euros of equity value.
      </p>

      <div className="mt-10 grid gap-6 border border-line p-5 sm:p-7 md:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="text-xs font-medium tracking-wide text-accent">THE ANSWER</p>
          <p className="mt-2 text-xl font-medium leading-snug sm:text-2xl">
            Buffer the cheap, failure-prone modules: {describePolicy(R.policy.buffers)}. Hold no spare optics.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            That is €{R.policy.value.toFixed(0)}m of inventory, worth {signedM(pv.mean)} of equity value (95% confidence interval{" "}
            {signedM(pv.ci95[0])} to {signedM(pv.ci95[1])}). Holding two spare sets of everything instead destroys{" "}
            {signedM(u2.delta.mean).replace("−", "")}. ASML is the only EUV supplier, so a late system is mostly a delayed sale, not a lost
            one, and stock that ties up cash rarely pays for itself. The buffer matters more for on-time delivery ({pct(s0.ontime.mean, 0)} → {pct(s1.ontime.mean, 0)})
            than for the share price.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 self-start">
          <StatTile label="Value of recommended buffers" value={signedM(pv.mean)} note={`± ${(1.96 * pv.se).toFixed(1)}m (95% CI of the mean)`} tone="good" />
          <StatTile label="Two spare sets of everything" value={signedM(u2.delta.mean)} note={`€${u2.buffer_value.toFixed(0)}m of stock`} tone="bad" />
          <StatTile label="Cost of supply-chain risk" value={`${eur(risk.per_share, 2)}/sh`} note={`€${(risk.mean / 1000).toFixed(2)}bn vs a perfect supply chain`} />
          <StatTile label="Value range (P5–P95)" value={`${eur(s0.price.p5)}–${eur(s0.price.p95)}`} note={`DCF base ${eur(R.meta.base_price, 1)} · market ${eur(R.meta.market_price)}`} />
        </div>
      </div>
      <p className="mt-4 text-xs text-faint">
        Supplier lead times, yields and disruption rates are not published. They are labelled illustrative assumptions with stated
        ranges, and the sensitivity chapter shows which ones the decision depends on. These are simulated outcomes, not predictions.
      </p>
    </header>
  );
}

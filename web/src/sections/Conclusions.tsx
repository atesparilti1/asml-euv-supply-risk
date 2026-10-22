import { Chapter } from "../components/ui";
import { describePolicy, R, REPO } from "../data";
import { signedM } from "../lib/format";

function Col({ title, items }: { title: string; items: React.ReactNode[] }) {
  return (
    <div className="border-t-2 border-ink pt-4">
      <p className="text-sm font-semibold">{title}</p>
      <ul className="mt-3 grid gap-3 text-sm leading-relaxed text-muted">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}

export function Conclusions() {
  const alt = R.alternatives;
  return (
    <Chapter id="conclusions" n="09" kicker="Conclusions" title="What the simulation supports, and what it does not"
      lede="Simulated outcomes are not forecasts. They show what follows if the stated assumptions hold, and the sensitivity work shows which assumptions carry the weight.">
      <div className="grid gap-8 md:grid-cols-3">
        <Col title="Supported" items={[
          <>Uniform buffering, the same spare sets of every module, loses value at every level tested. This is robust to the distribution shape, the seed, the number of paths and doubled dependence at two sets or more.</>,
          <>Spare modules should go where they are cheap per unit of risk removed: lasers and light sources, not optics. The recommended {describePolicy(R.policy.buffers)} is worth {signedM(R.policy_value.mean)} with a tight confidence interval.</>,
          <>Supply-chain risk barely moves ASML's valuation (about €{R.supply_risk.none.per_share.toFixed(1)} a share). It cannot explain the gap between the DCF (€935) and the market (€1,611).</>,
        ]} />
        <Col title="Still uncertain" items={[
          <>Every supplier input is an illustrative prior. Real outage histories, qualification yields and lead times would replace them, and laser and light-source reliability is the first data to get.</>,
          <>How strongly failures cluster: with independent inputs the buffer is worth only {signedM(alt[2].policy.mean)}; with doubled dependence it is worth {signedM(alt[3].policy.mean)}.</>,
          <>Costs the model leaves out: customer goodwill, contract penalties, and a chipmaker's lost fab output when a tool is late. Each would raise the value of buffers.</>,
        ]} />
        <Col title="Depends most on assumptions" items={[
          <>The size of the buffer's value, which swings with the laser outage rate, operating leverage and dependence. Its sign, positive for cheap modules, holds in every alternative tested.</>,
          <>The monopoly assumption. If waiting customers cancelled about 4% of orders a month, as they might with a credible competitor, broad buffers would start to pay.</>,
          <>Valuation levels, which come from the DCF's demand and terminal assumptions, not from this model. The simulator changes the timing of EUV revenue, not the long-run thesis.</>,
        ]} />
      </div>
      <div className="mt-12 grid gap-3 border border-line p-5 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
        <p className="text-muted">The full study (Python engine, tests, analysis) is reproducible: <span className="mono text-ink">python run.py</span>. Seed {R.meta.seed}, {R.meta.n_paths.toLocaleString("en-GB")} paths, about {Math.round(R.meta.runtime_s / 60)} minutes.</p>
        <div className="flex flex-wrap gap-2 text-xs">
          <a className="border border-line px-3 py-1.5 hover:border-accent" href="downloads/paths_sample.csv" download>Paths sample (CSV)</a>
          <a className="border border-line px-3 py-1.5 hover:border-accent" href="downloads/assumptions.json" download>Assumptions (JSON)</a>
          <a className="border border-line px-3 py-1.5 hover:border-accent" href={REPO}>Source on GitHub</a>
        </div>
      </div>
    </Chapter>
  );
}

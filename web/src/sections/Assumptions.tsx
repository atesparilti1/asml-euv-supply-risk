import { Callout, Chapter, Tag } from "../components/ui";
import { R } from "../data";
import { num, pct } from "../lib/format";

const fmtVal = (unit: string, v: number) => (unit === "share" || unit === "per month" ? pct(v, unit === "per month" ? 2 : 1) : num(v, v < 1 ? 3 : 2));

export function Assumptions() {
  const f = R.fixed;
  const fixed: [string, string, string, string][] = [
    ["Planned EUV shipments 2027–30", `NXE ${f.plan_units.NXE.join(" / ")} · EXE ${f.plan_units.EXE.join(" / ")}`, "systems", "SOURCED"],
    ["Average selling price", `NXE €${f.asp.NXE.join("/")}m · EXE €${f.asp.EXE.join("/")}m`, "€m per system", "SOURCED"],
    ["Low-NA capacity in 2026", `${f.nxe_capacity_2026} systems, +${pct(f.expansion_step, 0)} planned for 2027, +${pct(f.expansion_step, 0)} under study for 2028`, "systems/yr", "SOURCED"],
    ["WACC, terminal growth, margins", `${pct(f.wacc, 2)} WACC; all other DCF drivers held at the Base case`, "", "SOURCED"],
    ["Supplier capacity headroom", `${f.supplier_headroom}× ASML integration capacity`, "", "ILLUSTRATIVE"],
    ["Module cost (NXE)", `optics €${f.module_cost.NXE[0]}m · source €${f.module_cost.NXE[1]}m · laser €${f.module_cost.NXE[2]}m (EXE 1.6×)`, "€m", "ILLUSTRATIVE"],
    ["Holding cost of a buffer", `${pct(f.obsolescence, 0)} a year of its value plus the cash tied up (NWC)`, "", "ILLUSTRATIVE"],
    ["Outage severity · duration", `${f.severity} · ${f.duration}, capped at ${f.duration_cap} months`, "", "ILLUSTRATIVE"],
    ["Stress persistence · demand persistence", `φ = ${f.stress_phi} monthly · ρ = ${f.demand_rho} yearly`, "", "ILLUSTRATIVE"],
    ["Yield sensitivity to stress", `κ = ${f.yield_stress_kappa} (yield × e^(−κ·stress⁺))`, "", "ILLUSTRATIVE"],
  ];
  return (
    <Chapter id="assumptions" n="03" kicker="Assumptions" title="What is known, and what is a labelled guess"
      lede={<>Plan volumes, prices, capacity and the cost of capital come from the DCF, which cites ASML's 2025 20-F and its 2026 releases.
        Nothing about supplier reliability is published, so every such input is an <strong className="text-ink">illustrative</strong> prior with
        its range shown. The point of the sensitivity chapter is to find out which of these guesses the answer depends on.</>}>
      <div className="overflow-x-auto">
        <table className="data min-w-[760px]">
          <thead>
            <tr><th>Uncertain input</th><th>Unit</th><th>Distribution</th><th className="r">Mean</th><th className="r">P5–P95</th><th>Justification</th><th /></tr>
          </thead>
          <tbody>
            {R.assumptions.map((a) => (
              <tr key={a.name}>
                <td className="font-medium">{a.label}</td>
                <td className="text-muted">{a.unit}</td>
                <td className="mono text-[11.5px]">{a.dist}</td>
                <td className="r">{fmtVal(a.unit, a.mean)}</td>
                <td className="r whitespace-nowrap">{fmtVal(a.unit, a.p5)}–{fmtVal(a.unit, a.p95)}</td>
                <td className="max-w-[22rem] text-muted">{a.why}</td>
                <td><Tag>{a.tag}</Tag></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-8 grid gap-6 md:grid-cols-[1.5fr_1fr]">
        <div className="overflow-x-auto">
          <table className="data min-w-[560px]">
            <thead><tr><th>Fixed input</th><th>Value</th><th /></tr></thead>
            <tbody>{fixed.map(([k, v, , tag]) => (
              <tr key={k}><td className="font-medium">{k}</td><td className="text-muted">{v}</td><td><Tag tone={tag === "SOURCED" ? "accent" : undefined}>{tag}</Tag></td></tr>
            ))}</tbody>
          </table>
        </div>
        <div className="grid content-start gap-4">
          <Callout title="Dependence, and what independence would get wrong">
            Demand, outage rates and yields all load on one stress factor, and the two products share every supplier. Treated as
            independent, bad months would cancel out across suppliers. Tail risk would be understated, and buffers would look
            worthless, because they pay off exactly when several things go wrong at once. The validation chapter shows that this is what happens.
          </Callout>
          <Callout title="What is deliberately left out">
            Uncertainty in prices, the DUV business and services (held at the DCF Base case), supplier lead-time pipelines, and second
            sourcing. Each could be added if the sensitivity results said it mattered. For the buffer decision, the demand inputs that
            are included move the answer far less than the supplier inputs.
          </Callout>
        </div>
      </div>
    </Chapter>
  );
}

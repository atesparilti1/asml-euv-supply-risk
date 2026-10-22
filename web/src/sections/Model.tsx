import { Callout, Chapter, Tex } from "../components/ui";

function Eq({ n, title, children, tex }: { n: string; title: string; children: React.ReactNode; tex: string[] }) {
  return (
    <div className="grid gap-3 border-t border-line py-6 md:grid-cols-[16rem_1fr]">
      <div>
        <p className="mono text-xs text-faint">{n}</p>
        <p className="mt-1 text-sm font-medium">{title}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted">{children}</p>
      </div>
      <div className="min-w-0">{tex.map((t) => <Tex key={t} block>{t}</Tex>)}</div>
    </div>
  );
}

const KINDS = [
  ["Known, fixed (sourced)", "Plan units and prices FY27–30, FY25 actuals, ASML's stated capacity (~65 low-NA systems in 2026, +30% steps), WACC 9.38%, terminal growth, margins. All taken from the DCF Base case."],
  ["Decision variables", "Buffer level per module and product, B_{m,p} (six whole numbers)."],
  ["Random within a path (aleatory)", "Monthly stress shocks, yearly demand shocks, outage arrivals, severities and durations, which modules pass qualification, which waiting customers cancel."],
  ["Uncertain parameters (epistemic)", "Disruption rates, mean yields, capacity-ramp attainment, High-NA capacity, dependence loadings, demand volatility, cancellation hazard, operating leverage. One draw per path from a prior."],
  ["Calculated", "Module stock, late orders, shipments, revenue, free cash flow, equity value and price per share."],
];

export function Model() {
  return (
    <Chapter id="model" n="02" kicker="Model" title="The mathematics of one path"
      lede={<>Time runs monthly over 48 months, January 2027 to December 2030, indexed by ship date. Paths are{" "}
        <Tex>{"i=1..N"}</Tex>, products are <Tex>{"p\\in\\{\\text{NXE},\\text{EXE}\\}"}</Tex> and modules are{" "}
        <Tex>{"m\\in\\{\\text{optics},\\text{source},\\text{laser}\\}"}</Tex>. Building and testing a system takes a fixed time{" "}
        <Tex>{"L"}</Tex>, so modules for a system due in month <Tex>{"t"}</Tex> must be ready by month <Tex>{"t-L"}</Tex>. Because <Tex>{"L"}</Tex> is fixed this only relabels the calendar, and it drops out.</>}>
      <Eq n="2.1" title="Shared industry stress" tex={["S_t=\\phi\\,S_{t-1}+\\sqrt{1-\\phi^2}\\,\\varepsilon_t,\\qquad \\varepsilon_t\\sim\\mathcal N(0,1),\\ \\phi=0.9"]}>
        One persistent factor (stationary, unit variance) drives everything that tends to go wrong at the same time. This is how
        the model represents dependence.
      </Eq>
      <Eq n="2.2" title="Demand (orders due)" tex={[
        "\\log D_y=\\rho\\log D_{y-1}+\\sigma_D\\sqrt{1-\\rho^2}\\Big(\\sqrt{1-\\gamma^2}\\,\\eta_y+\\gamma\\,\\bar S_y\\Big),\\quad \\rho=0.6",
        "d_{p,t}=\\big\\lfloor \\textstyle\\sum_{\\tau\\le t}\\text{plan}_{p,y(\\tau)}D_{y(\\tau)}/12\\big\\rfloor-\\big\\lfloor \\textstyle\\sum_{\\tau<t}\\cdots\\big\\rfloor",
      ]}>
        Lognormal and persistent across years, with median equal to the DCF plan. <Tex>{"\\bar S_y"}</Tex> is the standardised yearly
        mean of stress, so <Tex>{"\\gamma>0"}</Tex> makes boom years stress suppliers. Cumulative rounding turns rates into whole machines and keeps yearly totals exact.
      </Eq>
      <Eq n="2.3" title="Supplier outages" tex={[
        "\\lambda_m(t)=\\lambda_m\\,e^{\\beta S_t},\\qquad \\Pr[\\text{outage starts in }t]=1-e^{-\\lambda_m(t)/12}",
        "A_m(t)=1-\\delta\\ \\text{ for }\\tau\\text{ months},\\qquad \\delta\\sim\\text{Beta}(2,3),\\ \\ \\tau=\\lceil\\text{Lognormal}(\\ln 2,\\,0.8)\\rceil\\le18",
      ]}>
        Poisson arrivals whose rate rises with stress. An outage removes a share δ of capacity (mean 40%) for a heavy-tailed number
        of months (median 2). One outage at a supplier hits both product lines.
      </Eq>
      <Eq n="2.4" title="Module output" tex={[
        "r_{m,p,t}=\\Big\\lceil \\big(\\text{target}_{p,t}+B_{m,p}-I_{m,p,t}\\big)^+/\\pi_m\\Big\\rceil,\\qquad n_{m,p,t}=\\min\\big(\\lfloor c_{m,p,t}\\rfloor,\\ r_{m,p,t}\\big)",
        "q_{m,p,t}\\sim\\text{Binomial}\\big(n_{m,p,t},\\ \\pi_m e^{-\\kappa S_t^+}\\big)",
      ]}>
        Suppliers start enough modules to cover this month's build and refill the buffer to <Tex>{"B"}</Tex>, allowing for expected yield <Tex>{"\\pi_m"}</Tex>.
        Starts are capped by a capacity credit <Tex>{"c"}</Tex> that accrues <Tex>{"1.1\\times"}</Tex> ASML's monthly capacity times <Tex>{"A_m(t)"}</Tex>. Each start passes qualification with probability <Tex>{"\\pi_m"}</Tex>, which falls a little under stress.
      </Eq>
      <Eq n="2.5" title="Assembly and late orders" tex={[
        "a_{p,t}=\\min\\big(I_{\\text{optics},p,t},\\,I_{\\text{source},p,t},\\,I_{\\text{laser},p,t},\\ \\text{target}_{p,t}\\big),\\qquad \\text{target}_{p,t}=\\min(d_{p,t}+\\ell_{p,t},\\ \\lfloor\\text{bays}_{p,t}\\rfloor)",
        "I_{m,p,t+1}=I_{m,p,t}+q_{m,p,t}-a_{p,t},\\qquad \\ell_{p,t+1}=d_{p,t}+\\ell_{p,t}-a_{p,t}-\\text{Binomial}(\\cdot,h)",
      ]}>
        A system needs one of each module. Late orders <Tex>{"\\ell"}</Tex> are served first. Each month a waiting customer cancels
        with probability <Tex>{"h"}</Tex> (mean 0.5%). Integration bays follow ASML's stated 2026 capacity of ~65 low-NA systems plus the two +30% steps, scaled by how much of each step is achieved.
      </Eq>
      <Eq n="2.6" title="Link to the DCF" tex={[
        "\\text{Rev}^{\\text{EUV}}_{y}=\\textstyle\\sum_p \\text{ships}_{p,y}\\,\\text{ASP}_{p,y},\\qquad \\text{EBITDA margin}_y=m_y-\\theta\\,\\big(1-\\text{Rev}^{\\text{EUV}}_y/\\text{Rev}^{\\text{EUV,plan}}_y\\big)^+",
        "\\text{FCF}_y=\\text{DCF}_{\\text{Base}}(\\text{Rev}_y,\\text{margin}_y)-0.05\\,V_B-\\Delta\\text{NWC}(V_B),\\qquad V_B=\\textstyle\\sum_{m,p}B_{m,p}\\,\\text{cost}_{m,p}",
        "\\text{Value}=\\textstyle\\sum_{y=2026}^{2035}\\dfrac{\\text{FCF}_y}{(1+\\text{WACC})^{t_y}}+\\dfrac{\\tfrac12\\,\\text{TV}_{\\text{Gordon}}+\\tfrac12\\,\\text{TV}_{\\text{exit}}}{(1+\\text{WACC})^{t_N}}+\\text{cash}-\\text{debt}+\\text{non-op}",
      ]}>
        Simulated shipments replace the plan in FY27–30. Shortfalls cost margin through operating leverage <Tex>{"\\theta"}</Tex>. The
        buffer adds to working capital and costs 5% a year to hold. The FY31–35 fade starts from <em>demand-implied</em> FY30 revenue, so a supply hiccup in 2030 delays
        value instead of lowering the terminal value forever. Orders still late at the end of 2030 ship in FY31.
      </Eq>

      <div className="mt-4 grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <table className="data">
          <thead><tr><th>Kind of quantity</th><th>In this model</th></tr></thead>
          <tbody>{KINDS.map(([k, v]) => <tr key={k}><td className="font-medium">{k}</td><td className="text-muted">{v.split("B_{m,p}").map((s, i) => i ? <span key={i}><Tex>{"B_{m,p}"}</Tex>{s}</span> : s)}</td></tr>)}</tbody>
        </table>
        <div className="grid content-start gap-4">
          <Callout title="Two kinds of uncertainty">
            <strong className="text-ink">Randomness</strong> (which month an outage hits) would remain even with perfect knowledge.{" "}
            <strong className="text-ink">Parameter uncertainty</strong> (is the laser outage rate 0.1 or 0.4 a year?) is ignorance that
            better data can reduce. Each path draws its parameters from a prior and then its random events, so the spread contains both.
            A second run with parameters fixed at their means isolates the randomness.
          </Callout>
          <Callout title="Why not normal distributions">
            Every input is non-negative, bounded or skewed. A normal distribution would allow negative outage durations or yields above 100%, and it would
            understate long outages. The model uses gamma for rates, beta for shares and lognormal for durations and demand.
          </Callout>
        </div>
      </div>
    </Chapter>
  );
}

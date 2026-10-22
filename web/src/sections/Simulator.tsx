import { useCallback, useEffect, useRef, useState } from "react";
import { C, CdfChart, FanChart, HistChart } from "../charts/charts";
import { Chapter, Legend, Panel, StatTile } from "../components/ui";
import type { RunResult } from "../engine/analysis";
import { BASE_PRICE, bufferValue, DEFAULTS, MODULES, PRODUCTS, validate, type Settings } from "../engine/model";
import { MODULE_LABEL } from "../data";
import { eur, MONTHS, num, pct, signedM } from "../lib/format";

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Slider({ label, value, min, max, step, fmt, onChange, hint }: {
  label: string; value: number; min: number; max: number; step: number; fmt: (x: number) => string; onChange: (x: number) => void; hint: string;
}) {
  const id = `sl-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-xs text-muted">{label}</label>
        <span className="num text-xs">{fmt(value)}</span>
      </div>
      <input id={id} type="range" className="rng" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <p className="text-[11px] text-faint">{hint}</p>
    </div>
  );
}

function Stepper({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const btn = "h-7 w-7 border border-line text-sm text-muted hover:text-ink disabled:opacity-40";
  return (
    <div className="inline-flex items-center" role="group" aria-label={label}>
      <button className={btn} onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0} aria-label={`fewer ${label}`}>−</button>
      <span className="num w-8 text-center text-sm">{value}</span>
      <button className={btn} onClick={() => onChange(Math.min(20, value + 1))} disabled={value >= 20} aria-label={`more ${label}`}>+</button>
    </div>
  );
}

const PRESETS: { label: string; b: number[][] }[] = [
  { label: "Recommended", b: DEFAULTS.buffers },
  { label: "No buffer", b: [[0, 0], [0, 0], [0, 0]] },
  { label: "2 of everything", b: [[2, 2], [2, 2], [2, 2]] },
];

export function Simulator() {
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [res, setRes] = useState<RunResult | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const worker = useRef<Worker | null>(null);

  const run = useCallback((settings: Settings) => {
    const errs = validate(settings);
    setErrors(errs);
    if (errs.length) return;
    worker.current?.terminate();
    const w = new Worker(new URL("../engine/worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    setProgress(0);
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") setProgress(m.done / m.total);
      if (m.type === "error") { setErrors(m.errors); setProgress(null); }
      if (m.type === "result") { setRes(m.result); setProgress(null); w.terminate(); }
    };
    w.postMessage(settings);
  }, []);

  useEffect(() => { run(DEFAULTS); return () => worker.current?.terminate(); }, [run]);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }));
  const setBuf = (m: number, p: number, v: number) => setS((prev) => ({ ...prev, buffers: prev.buffers.map((row, i) => row.map((x, j) => (i === m && j === p ? v : x))) }));

  const exportCsv = () => {
    if (!res) return;
    const cols = Object.keys(res.paths);
    const lines = [["path", ...cols].join(",")];
    for (let i = 0; i < res.n; i++) lines.push([i, ...cols.map((c) => +res.paths[c][i].toPrecision(7))].join(","));
    download(`euv-sim-paths-seed${res.settings.seed}.csv`, lines.join("\n"), "text/csv");
  };
  const exportJson = () => {
    if (!res) return;
    const { paths, hist, cdf, late, ...summary } = res;
    void paths; void hist; void cdf; void late;
    download(`euv-sim-summary-seed${res.settings.seed}.json`, JSON.stringify({
      note: "ASML EUV supply-chain Monte Carlo (browser engine). Supplier inputs are illustrative assumptions; see the Assumptions chapter.",
      buffer_value_eur_m: bufferValue(res.settings.buffers), dcf_base_price: BASE_PRICE, ...summary,
    }, null, 2), "application/json");
  };

  const series = [{ label: "No buffer", color: C.s1 }, { label: "Your buffers", color: C.s2 }];
  const lateMax = res ? Math.max(...res.late.none.p95, ...res.late.policy.p95) * 1.05 + 0.5 : 1;
  return (
    <Chapter id="simulator" n="08" kicker="Try it" title="Run the simulation yourself"
      lede={<>Change the buffers and the key assumptions, then press Run. Your policy and a no-buffer policy are simulated on the same random
        paths in your browser, so the difference between them is the policy, not luck. Results can be exported per path (CSV) or as a summary with the assumptions (JSON).</>}>
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <div className="grid content-start gap-5 border border-line p-4">
          <div>
            <p className="text-sm font-medium">Buffer stock (spare modules)</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => <button key={p.label} onClick={() => set("buffers", p.b)} className="border border-line px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-ink">{p.label}</button>)}
            </div>
            <table className="data mt-3">
              <thead><tr><th>Module</th>{PRODUCTS.map((p) => <th key={p} className="r">{p}</th>)}</tr></thead>
              <tbody>{MODULES.map((m, i) => (
                <tr key={m}><td className="text-xs">{MODULE_LABEL[m]}</td>
                  {PRODUCTS.map((p, j) => <td key={p} className="r"><Stepper value={s.buffers[i][j]} onChange={(v) => setBuf(i, j, v)} label={`${m} ${p} spares`} /></td>)}</tr>
              ))}</tbody>
            </table>
            <p className="mt-2 text-xs text-muted">Stock held: <span className="num text-ink">€{num(bufferValue(s.buffers), 1)}m</span></p>
          </div>
          <Slider label="Outage rates" value={s.lamMult} min={0} max={4} step={0.25} fmt={(v) => `${v.toFixed(2)}×`} onChange={(v) => set("lamMult", v)} hint="Multiplies every supplier's outage rate." />
          <Slider label="Qualification yields" value={s.yieldShift} min={-0.1} max={0.03} step={0.005} fmt={(v) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1)} pts`} onChange={(v) => set("yieldShift", v)} hint="Added to every module's pass rate." />
          <Slider label="Customer patience" value={s.cancelMult} min={0} max={16} step={0.5} fmt={(v) => `${(0.5 * v).toFixed(2)}%/mo cancel`} onChange={(v) => set("cancelMult", v)} hint="Share of waiting orders cancelled each month (mean)." />
          <Slider label="Dependence strength" value={s.stressScale} min={0} max={2} step={0.25} fmt={(v) => (v === 0 ? "independent" : `${v.toFixed(2)}×`)} onChange={(v) => set("stressScale", v)} hint="How strongly outages, yields and demand move together." />
          <Slider label="Demand volatility" value={s.demandVolMult} min={0} max={2} step={0.25} fmt={(v) => `${v.toFixed(2)}×`} onChange={(v) => set("demandVolMult", v)} hint="Scales year-to-year EUV order uncertainty." />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-muted">Paths
              <select className="mt-1 w-full border border-line bg-bg px-2 py-1.5 text-sm text-ink" value={s.nPaths} onChange={(e) => set("nPaths", parseInt(e.target.value))}>
                {[2000, 5000, 10000, 20000, 50000].map((n) => <option key={n} value={n}>{num(n)}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted">Seed
              <input type="number" className="mt-1 w-full border border-line bg-bg px-2 py-1.5 text-sm text-ink" value={s.seed} onChange={(e) => set("seed", parseInt(e.target.value || "0"))} />
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={() => run(s)} disabled={progress !== null}
              className="flex-1 bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink transition-transform active:scale-[0.98] disabled:opacity-60">
              {progress !== null ? `Running… ${Math.round(progress * 100)}%` : "Run simulation"}
            </button>
            <button onClick={() => { setS(DEFAULTS); run(DEFAULTS); }} className="border border-line px-3 text-xs text-muted hover:text-ink">Reset</button>
          </div>
          {progress !== null && <div className="h-0.5 bg-line"><div className="h-0.5 bg-accent transition-[width]" style={{ width: `${progress * 100}%` }} /></div>}
          {errors.length > 0 && <ul className="grid gap-1 border border-bad p-2 text-xs text-bad">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        </div>

        <div className="grid content-start gap-4" aria-live="polite">
          {res && (
            <>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <StatTile label="Value of your buffers" value={signedM(res.delta.mean, 1)} tone={res.delta.ci95[0] > 0 ? "good" : res.delta.ci95[1] < 0 ? "bad" : undefined}
                  note={`95% CI ${signedM(res.delta.ci95[0])} to ${signedM(res.delta.ci95[1])}`} />
                <StatTile label="On-time delivery" value={`${pct(res.none.ontime.mean, 0)} → ${pct(res.policy.ontime.mean, 0)}`} note={`delay ${num(res.none.delay.mean, 2)} → ${num(res.policy.delay.mean, 2)} months`} />
                <StatTile label="P(>5% orders unshipped)" value={`${pct(res.none.pShort5.p, 0)} → ${pct(res.policy.pShort5.p, 0)}`} note="no buffer → your buffers" />
                <StatTile label="Mean value per share" value={eur(res.policy.price.mean, 1)} note={`± ${(1.96 * res.policy.price.se).toFixed(2)} · P5–P95 ${eur(res.policy.price.p5)}–${eur(res.policy.price.p95)}`} />
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <Panel title="Value per share" aside={<Legend items={series} />}>
                  <HistChart edges={res.hist.none.edges} xFmt={(x) => eur(x)} h={220} refs={[{ x: BASE_PRICE, label: "DCF base" }]}
                    series={[{ ...series[0], counts: res.hist.none.counts }, { ...series[1], counts: res.hist.policy.counts }]} />
                </Panel>
                <Panel title="Cumulative probability" aside={<Legend items={series} />}>
                  <CdfChart xFmt={(x) => eur(x)} h={220} series={[{ ...series[0], ...res.cdf.none }, { ...series[1], ...res.cdf.policy }]} />
                </Panel>
                <Panel title="Late orders, no buffer"><FanChart fan={res.late.none} color={C.s1} labels={MONTHS} yFmt={(v) => num(v)} h={190} yMax={lateMax} /></Panel>
                <Panel title="Late orders, your buffers"><FanChart fan={res.late.policy} color={C.s2} labels={MONTHS} yFmt={(v) => num(v)} h={190} yMax={lateMax} /></Panel>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
                <span>{num(res.n)} paths × 2 policies in {(res.ms / 1000).toFixed(1)} s · seed {res.settings.seed}</span>
                <span className="flex gap-2">
                  <button onClick={exportCsv} className="border border-line px-3 py-1.5 hover:border-accent hover:text-ink">Export paths (CSV)</button>
                  <button onClick={exportJson} className="border border-line px-3 py-1.5 hover:border-accent hover:text-ink">Export summary + assumptions (JSON)</button>
                </span>
              </div>
            </>
          )}
          {!res && <p className="text-sm text-muted">Running the default study…</p>}
        </div>
      </div>
    </Chapter>
  );
}

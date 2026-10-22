// Small SVG chart kit: thin marks, hairline grid, hover tooltips. Colours come from CSS tokens.
import { scaleLinear, scaleLog } from "d3-scale";
import { area, curveMonotoneX, curveStepAfter, line } from "d3-shape";
import { type ReactNode, useState } from "react";
import { useSize } from "../components/ui";

export const C = { s1: "var(--s1)", s2: "var(--s2)", s3: "var(--s3)", neutral: "var(--neutral)", ink: "var(--ink)" };
type Fmt = (x: number) => string;
const M = { t: 12, r: 16, b: 34, l: 52 };

function Tip({ x, y, w, children }: { x: number; y: number; w: number; children: ReactNode }) {
  const left = Math.min(Math.max(x + 12, 0), w - 190);
  return (
    <div className="pointer-events-none absolute z-10 w-[180px] border border-line bg-bg/95 px-2.5 py-2 text-[11.5px] leading-snug shadow-sm"
      style={{ left, top: Math.max(0, y - 10) }}>
      {children}
    </div>
  );
}

function TipRow({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 text-muted">
        {color && <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />}{label}
      </span>
      <span className="num text-ink">{value}</span>
    </div>
  );
}

function Axes({ x, y, w, h, xFmt, yFmt, xTicks = 6, yTicks = 5, xLabel, yLabel, log = false }: {
  x: any; y: any; w: number; h: number; xFmt: Fmt; yFmt: Fmt; xTicks?: number; yTicks?: number; xLabel?: string; yLabel?: string; log?: boolean;
}) {
  const xt: number[] = log ? x.ticks(xTicks).filter((v: number) => [1, 2, 5].includes(+v.toExponential(0).split("e")[0])) : x.ticks(xTicks);
  return (
    <g fontSize={10.5} fill="var(--faint)">
      {y.ticks(yTicks).map((v: number) => (
        <g key={`y${v}`} transform={`translate(0,${y(v)})`}>
          <line x1={M.l} x2={w - M.r} stroke="var(--grid)" />
          <text x={M.l - 6} dy="0.32em" textAnchor="end" className="num">{yFmt(v)}</text>
        </g>
      ))}
      {xt.map((v) => (
        <text key={`x${v}`} x={x(v)} y={h - M.b + 16} textAnchor="middle" className="num">{xFmt(v)}</text>
      ))}
      <line x1={M.l} x2={w - M.r} y1={h - M.b} y2={h - M.b} stroke="var(--line)" />
      {xLabel && <text x={w - M.r} y={h - 4} textAnchor="end">{xLabel}</text>}
      {yLabel && <text x={M.l} y={M.t - 2} textAnchor="start" dy="-0.1em">{yLabel}</text>}
    </g>
  );
}

// ---------------------------------------------------------------- overlaid histograms
export interface HistSeries { label: string; color: string; counts: number[] }
export function HistChart({ edges, series, xFmt, h = 260, refs = [], xLabel }: {
  edges: number[]; series: HistSeries[]; xFmt: Fmt; h?: number; refs?: { x: number; label: string }[]; xLabel?: string;
}) {
  const [ref, w] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const shares = series.map((s) => { const n = s.counts.reduce((a, b) => a + b, 0); return s.counts.map((c) => c / n); });
  const x = scaleLinear().domain([edges[0], edges[edges.length - 1]]).range([M.l, w - M.r]);
  const y = scaleLinear().domain([0, Math.max(...shares.flat()) * 1.1]).nice().range([h - M.b, M.t + 8]);
  const step = (sh: number[]) => [...sh.map((v, i) => [edges[i], v] as [number, number]), [edges[edges.length - 1], sh[sh.length - 1]] as [number, number]];
  const ln = line<[number, number]>().x((d) => x(d[0])).y((d) => y(d[1])).curve(curveStepAfter);
  const ar = area<[number, number]>().x((d) => x(d[0])).y0(y(0)).y1((d) => y(d[1])).curve(curveStepAfter);
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      {w > 0 && (
        <svg width={w} height={h} role="img" aria-label="Distribution of outcomes"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect(), v = x.invert(e.clientX - r.left);
            const i = edges.findIndex((ed, k) => k < edges.length - 1 && v >= ed && v < edges[k + 1]);
            setHover(i >= 0 ? i : null);
          }}>
          <Axes x={x} y={y} w={w} h={h} xFmt={xFmt} yFmt={(v) => `${(v * 100).toFixed(0)}%`} xLabel={xLabel} yLabel="share of paths" />
          {hover !== null && <rect x={x(edges[hover])} width={Math.max(1, x(edges[hover + 1]) - x(edges[hover]))} y={M.t} height={h - M.b - M.t} fill="var(--accent-soft)" />}
          {shares.map((sh, k) => (
            <g key={k}>
              <path d={ar(step(sh)) ?? ""} fill={series[k].color} opacity={0.1} />
              <path d={ln(step(sh)) ?? ""} fill="none" stroke={series[k].color} strokeWidth={2} strokeLinejoin="round" />
            </g>
          ))}
          {refs.map((r) => (
            <g key={r.label} transform={`translate(${x(r.x)},0)`}>
              <line y1={M.t + 4} y2={h - M.b} stroke="var(--ink)" strokeWidth={1} opacity={0.55} />
              <text x={4} y={M.t + 16} textAnchor="start" fontSize={10.5} fill="var(--muted)">{r.label}</text>
            </g>
          ))}
        </svg>
      )}
      {hover !== null && (
        <Tip x={x(edges[hover])} y={30} w={w}>
          <p className="mb-1 text-muted">{xFmt(edges[hover])} to {xFmt(edges[hover + 1])}</p>
          {series.map((s, k) => <TipRow key={s.label} color={s.color} label={s.label} value={`${(shares[k][hover] * 100).toFixed(1)}%`} />)}
        </Tip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- cumulative probability
export interface CdfSeries { label: string; color: string; x: number[]; p: number[] }
const interp = (xs: number[], ps: number[], v: number) => {
  if (v <= xs[0]) return 0;
  if (v >= xs[xs.length - 1]) return 1;
  let i = 1;
  while (xs[i] < v) i++;
  const t = (v - xs[i - 1]) / Math.max(1e-12, xs[i] - xs[i - 1]);
  return ps[i - 1] + t * (ps[i] - ps[i - 1]);
};
export function CdfChart({ series, xFmt, h = 260, refs = [], domain, xLabel }: {
  series: CdfSeries[]; xFmt: Fmt; h?: number; refs?: { x: number; label: string }[]; domain?: [number, number]; xLabel?: string;
}) {
  const [ref, w] = useSize<HTMLDivElement>();
  const [hx, setHx] = useState<number | null>(null);
  const all = series.flatMap((s) => s.x);
  const dom = domain ?? [all.slice().sort((a, b) => a - b)[Math.floor(all.length * 0.003)], all.slice().sort((a, b) => a - b)[Math.floor(all.length * 0.997)]];
  const x = scaleLinear().domain(dom).range([M.l, w - M.r]).clamp(true);
  const y = scaleLinear().domain([0, 1]).range([h - M.b, M.t + 8]);
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHx(null)}>
      {w > 0 && (
        <svg width={w} height={h} role="img" aria-label="Cumulative probability"
          onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHx(x.invert(e.clientX - r.left)); }}>
          <Axes x={x} y={y} w={w} h={h} xFmt={xFmt} yFmt={(v) => `${(v * 100).toFixed(0)}%`} xLabel={xLabel} yLabel="probability ≤ x" />
          {series.map((s) => {
            const pts = s.x.map((v, i) => [x(v), y(s.p[i])] as [number, number]);
            return <path key={s.label} d={line()(pts) ?? ""} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />;
          })}
          {refs.map((r) => (
            <g key={r.label} transform={`translate(${x(r.x)},0)`}>
              <line y1={M.t + 4} y2={h - M.b} stroke="var(--ink)" opacity={0.55} />
              <text x={4} y={M.t + 16} textAnchor="start" fontSize={10.5} fill="var(--muted)">{r.label}</text>
            </g>
          ))}
          {hx !== null && <line x1={x(hx)} x2={x(hx)} y1={M.t} y2={h - M.b} stroke="var(--muted)" strokeWidth={1} />}
          {hx !== null && series.map((s) => (
            <circle key={s.label} cx={x(hx)} cy={y(interp(s.x, s.p, hx))} r={4} fill={s.color} stroke="var(--bg)" strokeWidth={2} />
          ))}
        </svg>
      )}
      {hx !== null && (
        <Tip x={x(hx)} y={30} w={w}>
          <p className="mb-1 text-muted">P(outcome ≤ {xFmt(hx)})</p>
          {series.map((s) => <TipRow key={s.label} color={s.color} label={s.label} value={`${(interp(s.x, s.p, hx) * 100).toFixed(1)}%`} />)}
        </Tip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- percentile fan over time
export interface FanData { p5: number[]; p25: number[]; p50: number[]; p75: number[]; p95: number[]; mean: number[] }
export function FanChart({ fan, color, labels, yFmt, h = 220, yMax, yLabel }: {
  fan: FanData; color: string; labels: string[]; yFmt: Fmt; h?: number; yMax?: number; yLabel?: string;
}) {
  const [ref, w] = useSize<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const n = fan.p50.length;
  const x = scaleLinear().domain([0, n - 1]).range([M.l, w - M.r]);
  const y = scaleLinear().domain([0, yMax ?? Math.max(...fan.p95) * 1.08 + 1e-9]).nice().range([h - M.b, M.t + 8]);
  const band = (lo: number[], up: number[]) => area<number>().x((_, i) => x(i)).y0((_, i) => y(lo[i])).y1((_, i) => y(up[i])).curve(curveMonotoneX)(lo) ?? "";
  const ln = (v: number[]) => line<number>().x((_, i) => x(i)).y((d) => y(d)).curve(curveMonotoneX)(v) ?? "";
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHi(null)}>
      {w > 0 && (
        <svg width={w} height={h} role="img" aria-label="Percentile bands over time"
          onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHi(Math.max(0, Math.min(n - 1, Math.round(x.invert(e.clientX - r.left))))); }}>
          <Axes x={x} y={y} w={w} h={h} xFmt={(v) => (v % 12 === 0 ? String(2027 + v / 12) : "")} xTicks={8} yFmt={yFmt} yLabel={yLabel} />
          <path d={band(fan.p5, fan.p95)} fill={color} opacity={0.1} />
          <path d={band(fan.p25, fan.p75)} fill={color} opacity={0.2} />
          <path d={ln(fan.p50)} fill="none" stroke={color} strokeWidth={2} />
          <path d={ln(fan.mean)} fill="none" stroke={color} strokeWidth={1.25} strokeDasharray="3 3" />
          {hi !== null && <line x1={x(hi)} x2={x(hi)} y1={M.t} y2={h - M.b} stroke="var(--muted)" />}
        </svg>
      )}
      {hi !== null && (
        <Tip x={x(hi)} y={20} w={w}>
          <p className="mb-1 text-muted">{labels[hi]}</p>
          <TipRow label="95th percentile" value={yFmt(fan.p95[hi])} />
          <TipRow label="75th" value={yFmt(fan.p75[hi])} />
          <TipRow color={color} label="median" value={yFmt(fan.p50[hi])} />
          <TipRow label="mean" value={yFmt(fan.mean[hi])} />
          <TipRow label="25th" value={yFmt(fan.p25[hi])} />
        </Tip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- generic lines (with optional band)
export interface LineSeries { label: string; color: string; y: number[]; band?: [number[], number[]]; dash?: boolean; dots?: boolean }
export function LinesChart({ x, series, xFmt, yFmt, h = 240, log = false, zero = false, xLabel, yLabel, yDomain }: {
  x: number[]; series: LineSeries[]; xFmt: Fmt; yFmt: Fmt; h?: number; log?: boolean; zero?: boolean; xLabel?: string; yLabel?: string; yDomain?: [number, number];
}) {
  const [ref, w] = useSize<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const xs = (log ? scaleLog() : scaleLinear()).domain([x[0], x[x.length - 1]]).range([M.l, w - M.r]);
  const vals = series.flatMap((s) => [...s.y, ...(s.band ? [...s.band[0], ...s.band[1]] : [])]).concat(zero ? [0] : []);
  const y = scaleLinear().domain(yDomain ?? [Math.min(...vals), Math.max(...vals)]).nice().range([h - M.b, M.t + 8]);
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHi(null)}>
      {w > 0 && (
        <svg width={w} height={h} role="img" aria-label={series.map((s) => s.label).join(", ")}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect(), v = xs.invert(e.clientX - r.left);
            let best = 0;
            x.forEach((xv, i) => { if (Math.abs(xs(xv) - xs(v)) < Math.abs(xs(x[best]) - xs(v))) best = i; });
            setHi(best);
          }}>
          <Axes x={xs} y={y} w={w} h={h} xFmt={xFmt} yFmt={yFmt} log={log} xLabel={xLabel} yLabel={yLabel} />
          {zero && y.domain()[0] < 0 && <line x1={M.l} x2={w - M.r} y1={y(0)} y2={y(0)} stroke="var(--muted)" />}
          {series.map((s) => (
            <g key={s.label}>
              {s.band && <path d={area<number>().x((_, i) => xs(x[i])).y0((_, i) => y(s.band![0][i])).y1((_, i) => y(s.band![1][i]))(s.y) ?? ""} fill={s.color} opacity={0.12} />}
              <path d={line<number>().x((_, i) => xs(x[i])).y((d) => y(d))(s.y) ?? ""} fill="none" stroke={s.color} strokeWidth={2}
                strokeDasharray={s.dash ? "4 3" : undefined} strokeLinejoin="round" strokeLinecap="round" />
              {s.dots && s.y.map((v, i) => <circle key={i} cx={xs(x[i])} cy={y(v)} r={4} fill={s.color} stroke="var(--bg)" strokeWidth={2} />)}
            </g>
          ))}
          {hi !== null && <line x1={xs(x[hi])} x2={xs(x[hi])} y1={M.t} y2={h - M.b} stroke="var(--muted)" />}
          {hi !== null && series.map((s) => <circle key={s.label} cx={xs(x[hi])} cy={y(s.y[hi])} r={4.5} fill={s.color} stroke="var(--bg)" strokeWidth={2} />)}
        </svg>
      )}
      {hi !== null && (
        <Tip x={xs(x[hi])} y={20} w={w}>
          <p className="mb-1 text-muted">{xFmt(x[hi])}</p>
          {series.map((s) => <TipRow key={s.label} color={s.color} label={s.label} value={yFmt(s.y[hi])} />)}
        </Tip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- tornado
export interface TornadoRow { label: string; lo: number; hi: number; loNote: string; hiNote: string }
const hbar = (x0: number, x1: number, y0: number, hgt: number) => {
  const r = Math.min(4, Math.abs(x1 - x0) / 2, hgt / 2), dir = x1 >= x0 ? 1 : -1;
  if (Math.abs(x1 - x0) < 0.5) return "";
  return `M${x0},${y0}H${x1 - dir * r}Q${x1},${y0} ${x1},${y0 + r}V${y0 + hgt - r}Q${x1},${y0 + hgt} ${x1 - dir * r},${y0 + hgt}H${x0}Z`;
};
export function TornadoChart({ rows, base, fmt, deltaFmt, labelW = 300 }: { rows: TornadoRow[]; base: number; fmt: Fmt; deltaFmt: Fmt; labelW?: number }) {
  const [ref, w] = useSize<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const rowH = 26, h = rows.length * rowH + 30;
  const narrow = w < 560;
  const lw = narrow ? 0 : labelW;
  const ext = Math.max(...rows.flatMap((r) => [Math.abs(r.lo - base), Math.abs(r.hi - base)])) * 1.1 || 1;
  const x = scaleLinear().domain([base - ext, base + ext]).range([lw + 8, w - 12]);
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHi(null)}>
      {w > 0 && (
        <svg width={w} height={narrow ? rows.length * (rowH + 14) + 30 : h} role="img" aria-label="Tornado sensitivity chart">
          {rows.map((r, i) => {
            const yy = narrow ? i * (rowH + 14) + 14 : i * rowH;
            return (
              <g key={r.label} transform={`translate(0,${yy})`} onMouseEnter={() => setHi(i)}>
                <rect x={0} y={narrow ? -14 : 0} width={w} height={narrow ? rowH + 14 : rowH} fill={hi === i ? "var(--accent-soft)" : "transparent"} />
                <text x={narrow ? 0 : lw} y={narrow ? -3 : rowH / 2} dy={narrow ? 0 : "0.32em"} textAnchor={narrow ? "start" : "end"} fontSize={11.5} fill="var(--ink)">{r.label}</text>
                <path d={hbar(x(base), x(r.lo), 5, rowH - 10)} fill={C.s1} />
                <path d={hbar(x(base), x(r.hi), 5, rowH - 10)} fill={C.s2} />
              </g>
            );
          })}
          <line x1={x(base)} x2={x(base)} y1={0} y2={(narrow ? rows.length * (rowH + 14) : h - 30)} stroke="var(--ink)" />
          <text x={x(base)} y={(narrow ? rows.length * (rowH + 14) + 12 : h - 14)} textAnchor="middle" fontSize={10.5} fill="var(--muted)">central {fmt(base)}</text>
        </svg>
      )}
      {hi !== null && (
        <Tip x={x(base)} y={(narrow ? hi * (rowH + 14) : hi * rowH) + 22} w={w}>
          <p className="mb-1 text-ink">{rows[hi].label}</p>
          <TipRow color={C.s1} label={`at P10 (${rows[hi].loNote})`} value={deltaFmt(rows[hi].lo - base)} />
          <TipRow color={C.s2} label={`at P90 (${rows[hi].hiNote})`} value={deltaFmt(rows[hi].hi - base)} />
        </Tip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- horizontal bar list
export function BarList({ rows, fmt, color = C.s1, max }: { rows: { label: string; value: number; note?: string }[]; fmt: Fmt; color?: string; max?: number }) {
  const [ref, w] = useSize<HTMLDivElement>();
  const top = max ?? Math.max(...rows.map((r) => r.value), 1e-9);
  return (
    <div ref={ref} className="grid gap-2">
      {w > 0 && rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-xs sm:grid-cols-[14rem_minmax(0,1fr)_3.5rem]" title={r.note}>
          <span className="truncate text-ink">{r.label}</span>
          <span className="num text-right text-muted sm:order-last">{fmt(r.value)}</span>
          <svg height={12} className="col-span-2 w-full sm:col-span-1" preserveAspectRatio="none" viewBox={`0 0 100 12`}>
            <rect x={0} y={5} width={100} height={2} fill="var(--grid)" />
            <rect x={0} y={1} width={Math.max(0.5, (r.value / top) * 100)} height={10} fill={color} />
          </svg>
        </div>
      ))}
    </div>
  );
}

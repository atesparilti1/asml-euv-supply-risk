// Statistics for in-browser runs (mirror engine/analysis.py).
import { BASE_PRICE, PLAN_TOTAL, runPath, SHARES, type PathOutcome, type Settings } from "./model";

export interface Stat { mean: number; se: number; sd: number; p5: number; p25: number; median: number; p75: number; p95: number }
export interface Prob { p: number; se: number }
export interface Fan { p5: number[]; p25: number[]; p50: number[]; p75: number[]; p95: number[]; mean: number[] }
export interface Hist { edges: number[]; counts: number[] }
export interface Cdf { x: number[]; p: number[] }

export function quantile(sorted: ArrayLike<number>, q: number): number {
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function stat(x: Float64Array): Stat {
  const n = x.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[i];
  mean /= n;
  let ss = 0;
  for (let i = 0; i < n; i++) ss += (x[i] - mean) ** 2;
  const sd = Math.sqrt(ss / (n - 1));
  const s = Float64Array.from(x).sort();
  return { mean, se: sd / Math.sqrt(n), sd, p5: quantile(s, 0.05), p25: quantile(s, 0.25), median: quantile(s, 0.5),
    p75: quantile(s, 0.75), p95: quantile(s, 0.95) };
}

export function prob(x: Float64Array, test: (v: number) => boolean): Prob {
  let k = 0;
  for (let i = 0; i < x.length; i++) if (test(x[i])) k++;
  const p = k / x.length;
  return { p, se: Math.sqrt((p * (1 - p)) / x.length) };
}

export function histogram(x: Float64Array, bins: number, lo: number, hi: number): Hist {
  const counts = new Array(bins).fill(0), w = (hi - lo) / bins;
  for (let i = 0; i < x.length; i++) {
    const k = Math.floor((x[i] - lo) / w);
    if (k >= 0 && k < bins) counts[k]++;   // tails beyond the 0.5th/99.5th percentiles are left out
  }
  return { edges: Array.from({ length: bins + 1 }, (_, k) => lo + k * w), counts };
}

export function cdf(x: Float64Array, points = 200): Cdf {
  const s = Float64Array.from(x).sort();
  const p = Array.from({ length: points }, (_, k) => k / (points - 1));
  return { x: p.map((q) => quantile(s, q)), p };
}

export function fan(series: Int16Array[], len: number): Fan {
  const out: Fan = { p5: [], p25: [], p50: [], p75: [], p95: [], mean: [] };
  const col = new Float64Array(series.length);
  for (let t = 0; t < len; t++) {
    let m = 0;
    for (let i = 0; i < series.length; i++) { col[i] = series[i][t]; m += col[i]; }
    col.sort();
    out.p5.push(quantile(col, 0.05)); out.p25.push(quantile(col, 0.25)); out.p50.push(quantile(col, 0.5));
    out.p75.push(quantile(col, 0.75)); out.p95.push(quantile(col, 0.95)); out.mean.push(m / series.length);
  }
  return out;
}

export interface PolicySummary {
  price: Stat; ships: Stat; ontime: Stat; delay: Stat; shortfall: Stat;
  pBelowBase: Prob; pShort5: Prob; pShips90: Prob; pOntime80: Prob;
}
export interface RunResult {
  settings: Settings; n: number; ms: number;
  none: PolicySummary; policy: PolicySummary;
  delta: Stat & { ci95: [number, number]; pBetter: number; perShare: number };
  hist: { none: Hist; policy: Hist }; cdf: { none: Cdf; policy: Cdf }; late: { none: Fan; policy: Fan };
  paths: Record<string, Float64Array>;
}

function summarize(o: PathOutcome[]): PolicySummary {
  const col = (f: (p: PathOutcome) => number) => Float64Array.from(o, f);
  const price = col((p) => p.price), ships = col((p) => p.ships), ontime = col((p) => p.ontime), short = col((p) => p.shortfall);
  return {
    price: stat(price), ships: stat(ships), ontime: stat(ontime), delay: stat(col((p) => p.delay)), shortfall: stat(short),
    pBelowBase: prob(price, (v) => v < BASE_PRICE), pShort5: prob(short, (v) => v > 0.05),
    pShips90: prob(ships, (v) => v < 0.9 * PLAN_TOTAL), pOntime80: prob(ontime, (v) => v < 0.8),
  };
}

/** Full run: n paths under both policies, with progress callbacks. */
export function runStudy(s: Settings, onProgress?: (done: number) => void): RunResult {
  const t0 = performance.now();
  const none: PathOutcome[] = [], policy: PathOutcome[] = [];
  const params: Record<string, number[]> = { lam_optics: [], lam_source: [], lam_laser: [], yield_optics: [], demand_mean: [] };
  for (let i = 0; i < s.nPaths; i++) {
    const r = runPath(s, i);
    none.push(r.none);
    policy.push(r.policy);
    params.lam_optics.push(r.draws.lam[0]); params.lam_source.push(r.draws.lam[1]); params.lam_laser.push(r.draws.lam[2]);
    params.yield_optics.push(r.draws.yld[0]); params.demand_mean.push(r.draws.D.reduce((a, b) => a + b, 0) / 4);
    if (onProgress && (i + 1) % 1000 === 0) onProgress(i + 1);
  }
  const d = Float64Array.from(none, (p, i) => policy[i].equity - p.equity);
  const ds = stat(d);
  const p0 = Float64Array.from(none, (p) => p.price), p1 = Float64Array.from(policy, (p) => p.price);
  const s0 = Float64Array.from(p0).sort();
  const lo = quantile(s0, 0.005), hi = quantile(s0, 0.995);
  return {
    settings: s, n: s.nPaths, ms: performance.now() - t0,
    none: summarize(none), policy: summarize(policy),
    delta: { ...ds, ci95: [ds.mean - 1.96 * ds.se, ds.mean + 1.96 * ds.se], pBetter: prob(d, (v) => v > 0).p, perShare: ds.mean / SHARES },
    hist: { none: histogram(p0, 60, lo, hi), policy: histogram(p1, 60, lo, hi) },
    cdf: { none: cdf(p0), policy: cdf(p1) },
    late: { none: fan(none.map((p) => p.late), 48), policy: fan(policy.map((p) => p.late), 48) },
    paths: {
      price_no_buffer: p0, price_policy: p1, delta_equity_eur_m: d,
      ships_no_buffer: Float64Array.from(none, (p) => p.ships), ships_policy: Float64Array.from(policy, (p) => p.ships),
      ontime_no_buffer: Float64Array.from(none, (p) => p.ontime), ontime_policy: Float64Array.from(policy, (p) => p.ontime),
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Float64Array.from(v)])),
    },
  };
}

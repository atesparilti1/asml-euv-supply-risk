// TypeScript port of engine/ (assumptions, simulate, dcf) for in-browser runs.
// The Python engine is the reference; model.test.ts checks this port against its exported results.
import { beta, binomInv, gamma, normInv, pathRng, triangular } from "./random";

// ---------------------------------------------------------------- assumptions (mirror engine/assumptions.py)
export const MODULES = ["optics", "source", "laser"] as const;
export const PRODUCTS = ["NXE", "EXE"] as const;
export const YEARS = [2027, 2028, 2029, 2030];
const T = 48, Y = 4, M = 3, P = 2;
export const PLAN = [[75, 82, 86, 88], [10, 14, 18, 22]];              // SOURCED, DCF Base [product][year]
export const ASP = [[260, 265, 270, 275], [360, 370, 380, 390]];       // EUR m per system
export const MODULE_COST = [[40, 18, 7], [64, 28.8, 11.2]];            // ILLUSTRATIVE [product][module], EUR m
const NXE_CAP_2026 = 65, STEP = 0.3, HEADROOM = 1.1, OBSOLESCENCE = 0.05;
const PHI = 0.9, RHO = 0.6, KAPPA = 0.03, D_LO = 0.6, D_HI = 1.5, DUR_CAP = 18;
const DUR_MEDIAN = 2, DUR_SIGMA = 0.8;
export const PLAN_TOTAL = PLAN.flat().reduce((a, b) => a + b, 0);

export interface Settings {
  nPaths: number;
  seed: number;
  buffers: number[][];      // [module][product] sets held
  lamMult: number;          // multiplies every disruption rate
  yieldShift: number;       // added to every qualification yield
  cancelMult: number;       // multiplies the cancellation hazard
  stressScale: number;      // dependence strength: 0 independent, 1 central, 2 doubled
  demandVolMult: number;    // multiplies demand volatility
}

export const DEFAULTS: Settings = {
  nPaths: 10000, seed: 2026, buffers: [[0, 0], [2, 0], [5, 1]],
  lamMult: 1, yieldShift: 0, cancelMult: 1, stressScale: 1, demandVolMult: 1,
};

export function validate(s: Settings): string[] {
  const e: string[] = [];
  if (!Number.isInteger(s.nPaths) || s.nPaths < 1000 || s.nPaths > 50000) e.push("Paths must be a whole number between 1,000 and 50,000.");
  if (!Number.isInteger(s.seed) || s.seed < 0 || s.seed > 2 ** 31) e.push("Seed must be a whole number between 0 and 2,147,483,648.");
  s.buffers.forEach((row, m) => row.forEach((b, p) => {
    if (!Number.isInteger(b) || b < 0 || b > 20) e.push(`Buffer for ${MODULES[m]} (${PRODUCTS[p]}) must be a whole number from 0 to 20.`);
  }));
  if (!(s.lamMult >= 0 && s.lamMult <= 5)) e.push("Disruption-rate multiplier must be between 0 and 5.");
  if (!(s.yieldShift >= -0.2 && s.yieldShift <= 0.05)) e.push("Yield shift must be between -20 and +5 points.");
  if (!(s.cancelMult >= 0 && s.cancelMult <= 20)) e.push("Cancellation multiplier must be between 0 and 20.");
  if (!(s.stressScale >= 0 && s.stressScale <= 3)) e.push("Dependence strength must be between 0 and 3.");
  if (!(s.demandVolMult >= 0 && s.demandVolMult <= 3)) e.push("Demand-volatility multiplier must be between 0 and 3.");
  return e;
}

export const bufferValue = (b: number[][]) =>
  b.reduce((acc, row, m) => acc + row[0] * MODULE_COST[0][m] + row[1] * MODULE_COST[1][m], 0);

// ---------------------------------------------------------------- DCF (mirror engine/dcf.py)
const DCF = {
  rev2025: 32667.3, nwc2025: (30616.1 - 12916.0 - 405.9 - 266.1) - (24263.9 - 1681.9) - 3366.3,
  nxeU: [65, 75, 82, 86, 88], nxeP: [255, 260, 265, 270, 275], exeU: [8, 10, 14, 18, 22], exeP: [350, 360, 370, 380, 390],
  arfiU: [130, 145, 150, 145, 140], arfiP: [86, 87, 89, 91, 93], odvG: [0, 0, 0, 0, 0], miG: [0.2, 0.1, 0.08, 0.06, 0.05],
  ibG: [0.3, 0.12, 0.1, 0.08, 0.07], odv: 1735.6, mi: 824.6, ib: 8193.0,
  em: [0.41, 0.42, 0.425, 0.43, 0.43], da: 0.028, capex: 0.055, nwc: -0.12, tax: 0.175, g: 0.025, exit: 20,
  price: 1611.4, shares: 384.9, cash: 7581.5, debt: 3697.7, nonop: 2310.7, h1: -1290.9,
  rf: 0.0351, erp: 0.0423, betaU: 1.39, taxMarg: 0.258, spread: 0.006,
};
const WACC = (() => {
  const mcap = DCF.price * DCF.shares;
  const beta = DCF.betaU * (1 + (1 - DCF.taxMarg) * DCF.debt / mcap);
  const we = mcap / (mcap + DCF.debt);
  return we * (DCF.rf + beta * DCF.erp) + (1 - we) * (DCF.rf + DCF.spread) * (1 - DCF.taxMarg);
})();
const Y0 = (Date.UTC(2026, 11, 31) - Date.UTC(2026, 9, 7)) / 86400000 / 365;
const DISC = Array.from({ length: 10 }, (_, i) => (i === 0 ? Y0 / 2 : Y0 + i - 0.5));
const TN = Y0 + 9;
const { BASE_EUV, OTHER } = (() => {
  let odv = DCF.odv, mi = DCF.mi, ib = DCF.ib;
  const euv: number[] = [], other: number[] = [];
  for (let i = 0; i < 5; i++) {
    odv *= 1 + DCF.odvG[i]; mi *= 1 + DCF.miG[i]; ib *= 1 + DCF.ibG[i];
    euv.push(DCF.nxeU[i] * DCF.nxeP[i] + DCF.exeU[i] * DCF.exeP[i]);
    other.push(DCF.arfiU[i] * DCF.arfiP[i] + odv + mi + ib);
  }
  return { BASE_EUV: euv, OTHER: other };
})();

/** Equity value (EUR m) of one path. Same hooks as dcf.value: shipped revenue, demand-anchored fade, carry-over, buffer cost. */
export function equityValue(euv: number[], anchor: number[], carry: number, bufVal: number, theta: number): number {
  const rev = new Array<number>(10), em = new Array<number>(10);
  rev[0] = BASE_EUV[0] + OTHER[0];
  em[0] = DCF.em[0];
  for (let i = 1; i < 5; i++) {
    rev[i] = OTHER[i] + euv[i - 1];
    em[i] = DCF.em[i] - theta * Math.max(0, 1 - euv[i - 1] / BASE_EUV[i]);
  }
  const a29 = OTHER[3] + anchor[2], a30 = OTHER[4] + anchor[3];
  const g30 = a30 / a29 - 1;
  let prev = a30;
  for (let k = 1; k <= 5; k++) {
    prev *= 1 + g30 + (DCF.g - g30) * k / 5;
    rev[4 + k] = prev;
    em[4 + k] = DCF.em[4];
  }
  rev[5] += carry;
  let sumPv = 0, prevNwc = DCF.nwc2025, ufcf = 0, ebitda = 0;
  for (let i = 0; i < 10; i++) {
    ebitda = rev[i] * em[i] - (i > 0 ? OBSOLESCENCE * bufVal : 0);
    const da = rev[i] * DCF.da;
    const nopat = (ebitda - da) * (1 - DCF.tax);
    const nwc = rev[i] * DCF.nwc + (i > 0 ? bufVal : 0);
    ufcf = nopat + da - rev[i] * DCF.capex - (nwc - prevNwc);
    prevNwc = nwc;
    sumPv += (i === 0 ? ufcf - DCF.h1 : ufcf) / (1 + WACC) ** DISC[i];
  }
  const bridge = DCF.cash - DCF.debt + DCF.nonop;
  const eqG = sumPv + (ufcf * (1 + DCF.g)) / (WACC - DCF.g) / (1 + WACC) ** TN + bridge;
  const eqX = sumPv + (ebitda * DCF.exit) / (1 + WACC) ** TN + bridge;
  return 0.5 * eqG + 0.5 * eqX;
}
export const SHARES = DCF.shares;
export const MARKET_PRICE = DCF.price;
export const BASE_PRICE = equityValue(BASE_EUV.slice(1), BASE_EUV.slice(1), 0, 0, 0) / DCF.shares;

// ---------------------------------------------------------------- one path
interface PathDraws {
  lam: number[]; yld: number[]; ramp27: number; ramp28: number; exeCap: number; betaS: number; gammaD: number;
  sigmaD: number; cancel: number; theta: number; stress: Float64Array; D: number[];
  uArrive: Float64Array; uSev: Float64Array; uDur: Float64Array; uYield: Float64Array; uCancel: Float64Array;
}

const ANNUAL_SD = (() => {
  let s = 0;
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) s += PHI ** Math.abs(i - j);
  return Math.sqrt(s) / 12;
})();

function drawPath(s: Settings, i: number): PathDraws {
  const u = pathRng(s.seed, i);
  const lam = [gamma(2, u) * 0.075, gamma(2, u) * 0.125, gamma(2, u) * 0.1].map((x) => x * s.lamMult);
  const yld = [beta(92, 8, u), beta(95, 5, u), beta(97, 3, u)].map((x) => Math.min(1, Math.max(0.5, x + s.yieldShift)));
  const ramp27 = beta(8, 2, u), ramp28 = beta(6, 3, u), exeCap = 0.85 + 0.45 * beta(5, 3, u);
  const betaS = 0.3 + 0.5 * u(), gammaD = 0.2 + 0.6 * u(), sigmaD = (0.06 + 0.08 * u()) * s.demandVolMult;
  const cancel = Math.min(1, beta(2, 398, u) * s.cancelMult), theta = triangular(0.1, 0.15, 0.25, u());

  const stress = new Float64Array(T);
  let st = normInv(u());
  for (let t = 0; t < T; t++) {
    st = PHI * st + Math.sqrt(1 - PHI * PHI) * normInv(u());
    stress[t] = st;
  }
  const g = Math.min(gammaD * s.stressScale, 0.95);
  const D: number[] = [];
  let logd = 0;
  for (let y = 0; y < Y; y++) {
    let zbar = 0;
    for (let k = 0; k < 12; k++) zbar += stress[y * 12 + k];
    zbar = zbar / 12 / ANNUAL_SD;
    const shock = Math.sqrt(1 - g * g) * normInv(u()) + g * zbar;
    logd = y === 0 ? sigmaD * shock : RHO * logd + sigmaD * Math.sqrt(1 - RHO * RHO) * shock;
    D.push(Math.min(D_HI, Math.max(D_LO, Math.exp(logd))));
  }
  const fill = (n: number) => { const a = new Float64Array(n); for (let k = 0; k < n; k++) a[k] = u(); return a; };
  return { lam, yld, ramp27, ramp28, exeCap, betaS: betaS * s.stressScale, gammaD, sigmaD, cancel, theta, stress, D,
    uArrive: fill(T * M), uSev: fill(T * M), uDur: fill(T * M), uYield: fill(T * M * P), uCancel: fill(T * P) };
}

export interface PathResult {
  ships: number[][];   // [year][product]
  orders: number[][];
  ontime: number; lost: number; lateEnd: number[]; lateMonths: number; late: Int16Array; downMonths: number[];
}

/** Severity Beta(2,3) by inverse CDF (bisection on the closed-form CDF 6x^2 - 8x^3 + 3x^4). */
function severityInv(u: number): number {
  let lo = 0, hi = 1;
  for (let k = 0; k < 40; k++) {
    const x = (lo + hi) / 2, F = x * x * (6 - 8 * x + 3 * x * x);
    if (F < u) lo = x; else hi = x;
  }
  return (lo + hi) / 2;
}

function simulatePath(d: PathDraws, buffers: number[][], orders: number[][], cap: number[][], kappa: number): PathResult {
  const inv = buffers.map((r) => r.slice());           // [module][product]
  const late = [0, 0], bay = [0, 0];
  const sup = [[0, 0], [0, 0], [0, 0]];
  const remaining = [0, 0, 0], severity = [0, 0, 0], downMonths = [0, 0, 0];
  const ships = Array.from({ length: Y }, () => [0, 0]);
  const ordY = Array.from({ length: Y }, () => [0, 0]);
  const lateSeries = new Int16Array(T);
  let ontime = 0, lost = 0, lateMonths = 0;
  for (let t = 0; t < T; t++) {
    const y = Math.floor(t / 12), s = d.stress[t];
    for (let m = 0; m < M; m++) {
      const hazard = (d.lam[m] * Math.exp(d.betaS * s)) / 12;
      if (remaining[m] === 0 && d.uArrive[t * M + m] < 1 - Math.exp(-hazard)) {
        const dur = Math.exp(Math.log(DUR_MEDIAN) + DUR_SIGMA * normInv(d.uDur[t * M + m]));
        remaining[m] = Math.min(DUR_CAP, Math.max(1, Math.ceil(dur)));
        severity[m] = severityInv(d.uSev[t * M + m]);
      }
      if (remaining[m] > 0) downMonths[m]++;
    }
    const yieldFactor = Math.exp(-kappa * Math.max(s, 0));
    for (let p = 0; p < P; p++) {
      const ord = orders[t][p];
      ordY[y][p] += ord;
      const due = ord + late[p], cb = cap[y][p];
      bay[p] = Math.min(bay[p] + cb, cb + 1);
      const target = Math.min(due, Math.floor(bay[p]));
      let minInv = Infinity;
      for (let m = 0; m < M; m++) {
        const need = Math.max(0, target + buffers[m][p] - inv[m][p]);
        const request = Math.ceil(need / d.yld[m] - 1e-9);
        const cs = cb * HEADROOM * (remaining[m] > 0 ? 1 - severity[m] : 1);
        sup[m][p] = Math.min(sup[m][p] + cs, cs + 1);
        const started = Math.min(Math.floor(sup[m][p]), request);
        sup[m][p] -= started;
        inv[m][p] += binomInv(d.uYield[(t * M + m) * P + p], started, d.yld[m] * yieldFactor);
        minInv = Math.min(minInv, inv[m][p]);
      }
      const built = Math.min(minInv, target);
      for (let m = 0; m < M; m++) inv[m][p] -= built;
      bay[p] -= built;
      ontime += Math.min(Math.max(built - late[p], 0), ord);
      ships[y][p] += built;
      late[p] = due - built;
      const lp = binomInv(d.uCancel[t * P + p], late[p], d.cancel);
      late[p] -= lp;
      lost += lp;
      lateMonths += late[p];
    }
    for (let m = 0; m < M; m++) remaining[m] = Math.max(remaining[m] - 1, 0);
    lateSeries[t] = late[0] + late[1];
  }
  return { ships, orders: ordY, ontime, lost, lateEnd: late, lateMonths, late: lateSeries, downMonths };
}

function ordersAndCapacity(d: PathDraws) {
  const orders = Array.from({ length: T }, () => [0, 0]);
  for (let p = 0; p < P; p++) {
    let cum = 0, prev = 0;
    for (let t = 0; t < T; t++) {
      const y = Math.floor(t / 12);
      cum += (d.D[y] * PLAN[p][y]) / 12;
      const f = Math.floor(cum + 1e-9);
      orders[t][p] = f - prev;
      prev = f;
    }
  }
  const c27 = NXE_CAP_2026 * (1 + STEP * d.ramp27), c28 = c27 * (1 + STEP * d.ramp28);
  const cap = YEARS.map((_, y) => [(y === 0 ? c27 : c28) / 12, (PLAN[1][y] * d.exeCap) / 12]);
  return { orders, cap };
}

export interface PathOutcome {
  price: number; equity: number; ships: number; ontime: number; delay: number; shortfall: number; lost: number;
  lateEnd: number; late: Int16Array;
}

function outcome(r: PathResult, d: PathDraws, bufVal: number): PathOutcome {
  const euv = [0, 1, 2, 3].map((y) => r.ships[y][0] * ASP[0][y] + r.ships[y][1] * ASP[1][y]);
  const anchor = [0, 1, 2, 3].map((y) => r.orders[y][0] * ASP[0][y] + r.orders[y][1] * ASP[1][y]);
  const carry = r.lateEnd[0] * ASP[0][3] + r.lateEnd[1] * ASP[1][3];
  const equity = equityValue(euv, anchor, carry, bufVal, d.theta);
  const ships = r.ships.flat().reduce((a, b) => a + b, 0);
  const orders = Math.max(1, r.orders.flat().reduce((a, b) => a + b, 0));
  return { price: equity / DCF.shares, equity, ships, ontime: r.ontime / orders, delay: r.lateMonths / orders,
    shortfall: 1 - ships / orders, lost: r.lost, lateEnd: r.lateEnd[0] + r.lateEnd[1], late: r.late };
}

export interface PathPair { none: PathOutcome; policy: PathOutcome; draws: PathDraws; downMonths: number[] }

/** Simulate path i under no buffer and under the chosen buffers, on the same random numbers. */
export function runPath(s: Settings, i: number): PathPair {
  const d = drawPath(s, i);
  const { orders, cap } = ordersAndCapacity(d);
  const kappa = KAPPA * s.stressScale;
  const zero = [[0, 0], [0, 0], [0, 0]];
  const r0 = simulatePath(d, zero, orders, cap, kappa);
  const r1 = simulatePath(d, s.buffers, orders, cap, kappa);
  return { none: outcome(r0, d, 0), policy: outcome(r1, d, bufferValue(s.buffers)), draws: d, downMonths: r0.downMonths };
}

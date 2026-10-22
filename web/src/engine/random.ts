// Seeded random numbers and the distributions the model needs. Everything is driven by uniforms so
// that two policies replaying the same path stream see identical randomness (common random numbers).

/** sfc32 generator seeded through splitmix32: fast, 128-bit state, good statistical quality. */
export function pathRng(seed: number, path: number): () => number {
  let s = (seed ^ Math.imul(path + 1, 0x9e3779b9)) >>> 0;
  const mix = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = mix(), b = mix(), c = mix(), d = mix();
  const next = () => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) >>> 0;
    return (t + 0.5) / 4294967296; // open interval (0, 1)
  };
  for (let i = 0; i < 12; i++) next();
  return next;
}

/** Inverse standard normal CDF (Acklam, |rel. error| < 1.2e-9). */
export function normInv(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5, r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Gamma(shape, 1) by Marsaglia-Tsang; shape < 1 uses the boost u^(1/shape). */
export function gamma(shape: number, u: () => number): number {
  if (shape < 1) return gamma(shape + 1, u) * Math.pow(u(), 1 / shape);
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      x = normInv(u());
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const w = u();
    if (w < 1 - 0.0331 * x ** 4 || Math.log(w) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export const beta = (a: number, b: number, u: () => number) => {
  const x = gamma(a, u);
  return x / (x + gamma(b, u));
};

export function triangular(lo: number, mode: number, hi: number, p: number): number {
  const c = (mode - lo) / (hi - lo);
  return p < c ? lo + (hi - lo) * Math.sqrt(p * c) : hi - (hi - lo) * Math.sqrt((1 - p) * (1 - c));
}

/** Inverse CDF of Binomial(n, p); monotone in the uniform, same algorithm as engine/simulate.py. */
export function binomInv(u: number, n: number, p: number): number {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  const q = 1 - p, ratio = p / q;
  let pmf = q ** n, cdf = pmf, k = 0;
  while (u > cdf && k < n) {
    pmf *= ((n - k) / (k + 1)) * ratio;
    k++;
    cdf += pmf;
  }
  return k;
}

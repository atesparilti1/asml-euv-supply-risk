// Cross-checks the browser engine against the Python reference (src/data/results.json).
import { describe, expect, it } from "vitest";
import results from "../data/results.json";
import { runStudy } from "./analysis";
import { BASE_PRICE, DEFAULTS, runPath, validate } from "./model";
import { binomInv, normInv, pathRng } from "./random";

describe("building blocks", () => {
  it("reproduces the DCF Base price", () => {
    expect(BASE_PRICE).toBeCloseTo(results.meta.base_price, 6);
  });
  it("binomial inverse CDF matches hand values", () => {
    expect(binomInv(0.5, 0, 0.9)).toBe(0);
    expect(binomInv(0.5, 5, 1)).toBe(5);
    expect(binomInv(0.05, 10, 0.92)).toBe(8);   // P(X<=7)=0.0401, P(X<=8)=0.1879
    expect(binomInv(0.95, 10, 0.92)).toBe(10);  // P(X<=9)=0.5656
  });
  it("normal inverse is accurate", () => {
    expect(normInv(0.975)).toBeCloseTo(1.959964, 5);
    expect(normInv(0.001)).toBeCloseTo(-3.090232, 5);
  });
  it("same seed and path give the same stream", () => {
    const a = pathRng(7, 3), b = pathRng(7, 3);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it("rejects bad settings with readable messages", () => {
    expect(validate({ ...DEFAULTS, nPaths: 10 })[0]).toMatch(/Paths/);
    expect(validate({ ...DEFAULTS, buffers: [[0, -1], [0, 0], [0, 0]] })[0]).toMatch(/optics \(EXE\)/);
    expect(validate(DEFAULTS)).toEqual([]);
  });
});

describe("invariants", () => {
  it("orders are shipped, lost or still late", () => {
    for (let i = 0; i < 300; i++) {
      const r = runPath(DEFAULTS, i);
      for (const o of [r.none, r.policy]) {
        expect(o.ships).toBeLessThanOrEqual(o.ships + o.lost + o.lateEnd);
        expect(o.ontime).toBeLessThanOrEqual(1);
        expect(o.shortfall).toBeGreaterThanOrEqual(-1e-12);
      }
    }
  });
});

describe("agrees with the Python engine within Monte Carlo error", () => {
  const r = runStudy({ ...DEFAULTS, nPaths: 20000 });
  const py = results.summary.none.stats;
  const tol = (a: { se: number }, b: { se: number }) => 4 * Math.hypot(a.se, b.se);

  it("mean price", () => {
    expect(Math.abs(r.none.price.mean - py.price.mean)).toBeLessThan(tol(r.none.price, py.price));
  });
  it("supply shortfall and on-time delivery", () => {
    expect(Math.abs(r.none.shortfall.mean - py.supply_shortfall.mean)).toBeLessThan(tol(r.none.shortfall, py.supply_shortfall));
    expect(Math.abs(r.none.ontime.mean - py.ontime.mean)).toBeLessThan(tol(r.none.ontime, py.ontime));
    expect(Math.abs(r.none.delay.mean - py.delay.mean)).toBeLessThan(tol(r.none.delay, py.delay));
  });
  it("value of the recommended buffers", () => {
    expect(Math.abs(r.delta.mean - results.policy_value.mean)).toBeLessThan(tol(r.delta, results.policy_value));
  });
});

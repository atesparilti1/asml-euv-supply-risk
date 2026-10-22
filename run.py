"""
Run the full study and export results for the report and the site.

    python run.py            # full study (~4 minutes)
    python run.py --quick    # 4,000 paths everywhere, for a fast check (~30 seconds)

Writes web/src/data/results.json (read by the site), web/public/downloads/*.csv|json (export) and
prints the headline numbers.
"""
import argparse
import csv
import json
import pathlib
import time

import numpy as np

from engine import analysis as X
from engine import assumptions as A
from engine import dcf, dcf_inputs as D
from engine import simulate as S

ROOT = pathlib.Path(__file__).parent
DATA = ROOT / "web" / "src" / "data"
DL = ROOT / "web" / "public" / "downloads"


def describe(dist) -> str:
    name = dist.dist.name
    a = [round(float(x), 4) for x in dist.args]
    loc, scale = dist.kwds.get("loc", 0), dist.kwds.get("scale", 1)
    if name == "gamma":
        return f"Gamma(shape {a[0]:g}, scale {scale:g})"
    if name == "beta":
        return f"Beta({a[0]:g}, {a[1]:g})" + (f" on [{loc:g}, {loc + scale:g}]" if (loc, scale) != (0, 1) else "")
    if name == "uniform":
        return f"Uniform({loc:g}, {loc + scale:g})"
    if name == "triang":
        c = dist.kwds.get("c", a[0] if a else 0.5)
        return f"Triangular({loc:g}, {loc + c * scale:g}, {loc + scale:g})"
    return name


def assumptions_table():
    rows = []
    for p in A.PRIORS:
        rows.append({"name": p.name, "label": p.label, "unit": p.unit, "dist": describe(p.dist), "mean": p.central,
                     "p5": float(p.ppf(0.05)), "p95": float(p.ppf(0.95)), "why": p.why, "tag": p.tag})
    fixed = {
        "plan_units": A.PLAN_UNITS, "asp": A.ASP, "nxe_capacity_2026": A.NXE_CAPACITY_2026,
        "expansion_step": A.EXPANSION_STEP, "supplier_headroom": A.SUPPLIER_HEADROOM, "module_cost": A.MODULE_COST,
        "obsolescence": A.OBSOLESCENCE, "stress_phi": A.STRESS_PHI, "demand_rho": A.DEMAND_RHO,
        "yield_stress_kappa": A.YIELD_STRESS_KAPPA, "demand_limits": A.DEMAND_LIMITS, "duration_cap": A.DURATION_CAP,
        "severity": "Beta(2, 3)", "duration": f"Lognormal(median {A.DURATION_MEDIAN:g} months, sigma {A.DURATION_SIGMA:g})",
        "wacc": dcf.wacc(), "base_price": dcf.base_price(), "market_price": D.PRICE, "shares": D.SHARES,
    }
    return rows, fixed


def write_paths_csv(path, r0, r1, n=5000):
    o0, o1 = X.outcomes(r0), X.outcomes(r1)
    cols = A.PRIOR_NAMES
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["path", *cols, "demand_mean", *[f"disrupted_months_{m}" for m in A.MODULES],
                    "ships_no_buffer", "ships_policy", "ontime_no_buffer", "ontime_policy",
                    "price_no_buffer", "price_policy", "delta_equity_eur_m"])
        for i in range(min(n, r0["price"].size)):
            w.writerow([i, *[f"{r0['params'][c][i]:.6g}" for c in cols], f"{r0['D'][i].mean():.4f}",
                        *[int(r0["disrupted_months"][i, j]) for j in range(len(A.MODULES))],
                        int(o0["ships"][i]), int(o1["ships"][i]), f"{o0['ontime'][i]:.4f}", f"{o1['ontime'][i]:.4f}",
                        f"{o0['price'][i]:.2f}", f"{o1['price'][i]:.2f}", f"{r1['equity'][i] - r0['equity'][i]:.2f}"])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--quick", action="store_true", help="4,000 paths everywhere")
    ap.add_argument("--no-export", action="store_true", help="print only")
    args = ap.parse_args()
    n = 4000 if args.quick else A.N_PATHS
    t0 = time.time()
    log = lambda msg: print(f"[{time.time() - t0:6.1f}s] {msg}", flush=True)

    log("optimising buffer policy (fit seed 99)")
    opt = X.optimise(n=2000 if args.quick else 8000, seed=99)
    policy = opt["buffers"]
    opt_check = X.optimise(n=2000 if args.quick else 8000, seed=101)
    log(f"  policy {policy}; refit on seed 101 -> {opt_check['buffers']}")

    log(f"main runs, {n:,} paths, seed {A.SEED}")
    shocks = S.draw_shocks(n, A.SEED)
    r0 = X.run_policy(A.uniform_buffers(0), shocks, n, keep_paths=True)
    r1 = X.run_policy(policy, shocks, n, keep_paths=True)
    delta = r1["equity"] - r0["equity"]
    s0, s1, pv = X.summarize(r0), X.summarize(r1), X.paired(r1, r0)

    log("uniform policies")
    uni = X.uniform_policies(shocks, n)
    log("uncertainty split")
    split = X.uncertainty_split(shocks, n, policy)
    log("tornado")
    tor = X.tornado(policy, shocks, n)
    log("cost of supply-chain risk")
    risk = X.cost_of_supply_risk(shocks, n, policy)
    log("global sensitivity")
    glob = X.global_sensitivity(r0, delta)
    log("convergence (2x paths, new seed)")
    n2 = 2 * n
    sh2 = S.draw_shocks(n2, A.SEED + 1)
    b0 = X.run_policy(A.uniform_buffers(0), sh2, n2)
    b1 = X.run_policy(policy, sh2, n2)
    conv = {"trace": X.convergence(b0, b1["equity"] - b0["equity"]),
            "compare": {"n": [n, n2], "seed": [A.SEED, A.SEED + 1],
                        "price_mean": [s0["stats"]["price"]["mean"], float(b0["price"].mean())],
                        "p_short": [s0["thresholds"]["supply_shortfall_above_5pct"]["p"],
                                    X.summarize(b0)["thresholds"]["supply_shortfall_above_5pct"]["p"]],
                        "policy_value": [pv["mean"], X.paired(b1, b0)["mean"]],
                        "policy_value_se": [pv["se"], X.paired(b1, b0)["se"]],
                        "best_uniform_k": [max(uni, key=lambda u: u["delta"]["mean"])["k"],
                                           max(X.uniform_policies(sh2, n2, levels=(0, 1, 2)), key=lambda u: u["delta"]["mean"])["k"]]}}
    log("alternative distributions and dependence")
    alts = X.alternatives(policy, n, A.SEED + 2)
    log("cancellation break-even")
    brk = X.breakeven_cancellation(policy, shocks, n)

    o0, o1 = X.outcomes(r0), X.outcomes(r1)
    lo, hi = float(np.percentile(o0["price"], 0.5)), float(np.percentile(o0["price"], 99.5))
    late0 = r0["late_t"].sum(axis=2).T.astype(float)
    late1 = r1["late_t"].sum(axis=2).T.astype(float)
    month = np.arange(A.MONTHS)
    charts = {
        "price_hist": {"none": X.histogram(o0["price"], lo=lo, hi=hi), "policy": X.histogram(o1["price"], lo=lo, hi=hi)},
        "price_cdf": {"none": X.cdf(o0["price"]), "policy": X.cdf(o1["price"])},
        "ships_hist": X.histogram(o0["ships"], bins=40),
        "ontime_cdf": {"none": X.cdf(o0["ontime"]), "policy": X.cdf(o1["ontime"])},
        "delta_hist": X.histogram(delta, bins=50),
        "late_fan": {"none": X.fan(late0.T), "policy": X.fan(late1.T)},
        "optics_inv_fan": X.fan(r0["inv_t"][:, :, 0, 0].astype(float)),
        "down_share": {m: r0["down_t"][:, :, i].astype(float).mean(axis=1).tolist() for i, m in enumerate(A.MODULES)},
        "stress_fan": X.fan(r0["stress"]),
        "ships_by_year": {p: {"plan": A.PLAN_UNITS[p], "none": X.fan(r0["ship_y"][:, :, j].T.astype(float)),
                              "orders": r0["orders_y"][:, :, j].mean(axis=0).tolist()}
                          for j, p in enumerate(A.PRODUCTS)},
        "months": month.tolist(),
    }
    table, fixed = assumptions_table()
    results = {
        "meta": {"n_paths": n, "seed": A.SEED, "runtime_s": None, "quick": args.quick,
                 "generated": time.strftime("%Y-%m-%d"), "base_price": dcf.base_price(), "market_price": D.PRICE,
                 "shares": D.SHARES, "wacc": dcf.wacc(), "plan_total": X.PLAN_TOTAL},
        "assumptions": table, "fixed": fixed,
        "policy": {"buffers": policy, "value": A.buffer_value(policy), "fit": opt, "refit": opt_check},
        "summary": {"none": s0, "policy": s1}, "policy_value": pv, "supply_risk": risk, "uniform": uni, "split": split,
        "tornado": tor, "global": glob, "convergence": conv, "alternatives": alts, "breakeven": brk, "charts": charts,
    }
    results["meta"]["runtime_s"] = round(time.time() - t0, 1)

    st = s0["stats"]
    print("\n=== headline (no buffer) ===")
    print(f"price  mean {st['price']['mean']:.1f} (se {st['price']['se']:.2f})  median {st['price']['median']:.1f}  "
          f"P5 {st['price']['p5']:.1f}  P95 {st['price']['p95']:.1f}  vs DCF base {dcf.base_price():.1f}")
    print(f"EUV systems shipped 2027-30: mean {st['ships']['mean']:.1f} of plan {X.PLAN_TOTAL}; "
          f"supply shortfall vs orders {st['supply_shortfall']['mean']:.1%}; on-time {st['ontime']['mean']:.1%}")
    for k, v in s0["thresholds"].items():
        print(f"  P({k}) = {v['p']:.3f} +/- {v['se']:.3f}")
    print(f"recommended buffers {policy} (EUR {A.buffer_value(policy):.0f}m): "
          f"value {pv['mean']:+.1f}m  95% CI [{pv['ci95'][0]:.1f}, {pv['ci95'][1]:.1f}]  on-time {s1['stats']['ontime']['mean']:.1%}")
    print(f"cost of supply-chain risk vs a perfect supply chain: {risk['none']['mean']:.0f}m "
          f"(EUR {risk['none']['per_share']:.2f}/share); with policy {risk['policy']['mean']:.0f}m")
    for u in uni:
        print(f"  uniform {u['k']}: EUR {u['buffer_value']:.0f}m -> {u['delta']['mean']:+.1f}m, on-time {u['ontime']:.1%}")
    print(f"done in {results['meta']['runtime_s']}s")

    if not args.no_export:
        DATA.mkdir(parents=True, exist_ok=True)
        DL.mkdir(parents=True, exist_ok=True)
        (DATA / "results.json").write_text(json.dumps(results, separators=(",", ":"), default=float))
        (DL / "assumptions.json").write_text(json.dumps({"priors": table, "fixed": fixed, "policy": policy}, indent=2, default=float))
        write_paths_csv(DL / "paths_sample.csv", r0, r1)
        print(f"wrote {DATA / 'results.json'} and {DL}")


if __name__ == "__main__":
    main()

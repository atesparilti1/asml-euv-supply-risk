"""
Analysis: statistics, buffer-policy comparison and optimisation, sensitivity, convergence, robustness.

Monte Carlo error is reported for every headline number. Policy differences are paired (same random
numbers), which makes them far more precise than the spread of either policy alone.
"""
import itertools

import numpy as np

from . import assumptions as A
from . import dcf_inputs as D
from . import simulate as S

PLAN_TOTAL = sum(sum(v) for v in A.PLAN_UNITS.values())
BASE_PRICE = D.BASE_PRICE_BLEND
QS = [5, 25, 50, 75, 95]


# ---------------------------------------------------------------- per-path outcomes
def outcomes(r: dict) -> dict:
    """Scalar outcome per path used throughout the analysis."""
    ships = r["ship_y"].sum(axis=(1, 2))
    orders = r["orders_y"].sum(axis=(1, 2))
    asp = np.array([A.ASP[p] for p in A.PRODUCTS]).T
    rev_orders = (r["orders_y"] * asp).sum(axis=(1, 2))
    return {
        "price": r["price"],
        "equity": r["equity"],
        "ships": ships,
        "supply_shortfall": 1 - ships / np.maximum(orders, 1),            # share of orders not shipped by Dec 2030
        "plan_shortfall": 1 - ships / PLAN_TOTAL,
        "ontime": r["ontime_y"].sum(axis=(1, 2)) / np.maximum(orders, 1),
        "rev_at_risk": (rev_orders - r["euv_rev"].sum(axis=1)) / 1000,     # EUR bn of ordered EUV revenue not shipped in 2027-30
        "delay": r["late_months"].sum(axis=1) / np.maximum(orders, 1),   # average months late per system ordered
        "late_end": r["late_end"].sum(axis=1),
        "lost": r["lost_y"].sum(axis=(1, 2)),
    }


def _stat(x):
    x = np.asarray(x, float)
    n = x.size
    p = np.percentile(x, QS)
    tail = np.sort(x)[: max(1, n // 20)]
    return {"mean": float(x.mean()), "se": float(x.std(ddof=1) / np.sqrt(n)), "sd": float(x.std(ddof=1)),
            "p5": float(p[0]), "p25": float(p[1]), "median": float(p[2]), "p75": float(p[3]), "p95": float(p[4]),
            "cvar5_low": float(tail.mean())}


def _prob(mask):
    m = np.asarray(mask, float)
    return {"p": float(m.mean()), "se": float(np.sqrt(m.mean() * (1 - m.mean()) / m.size))}


def summarize(r: dict) -> dict:
    o = outcomes(r)
    return {
        "n": int(r["price"].size),
        "buffer_value": r["buffer_value"],
        "stats": {k: _stat(v) for k, v in o.items() if k != "equity"},
        "thresholds": {
            "price_below_base": _prob(o["price"] < BASE_PRICE),
            "price_below_market": _prob(o["price"] < D.PRICE),
            "ships_below_90pct_plan": _prob(o["plan_shortfall"] > 0.10),
            "supply_shortfall_above_5pct": _prob(o["supply_shortfall"] > 0.05),
            "ontime_below_80pct": _prob(o["ontime"] < 0.80),
        },
    }


def paired(r_new: dict, r_ref: dict) -> dict:
    """Change in equity value per path (EUR m) from switching policy, on common random numbers."""
    d = r_new["equity"] - r_ref["equity"]
    s = _stat(d)
    s.update(ci95=[s["mean"] - 1.96 * s["se"], s["mean"] + 1.96 * s["se"]], p_better=float((d > 0).mean()),
             per_share=s["mean"] / D.SHARES)
    return s


# ---------------------------------------------------------------- policies
def run_policy(buffers, shocks, n, **kw):
    return S.run(A.Config(n_paths=n, buffers=buffers, keep_paths=kw.pop("keep_paths", False), **kw), shocks)


def uniform_policies(shocks, n, levels=(0, 1, 2, 3, 4, 6), **kw):
    ref = run_policy(A.uniform_buffers(0), shocks, n, **kw)
    rows = []
    for k in levels:
        r = ref if k == 0 else run_policy(A.uniform_buffers(k), shocks, n, **kw)
        o = outcomes(r)
        rows.append({"k": k, "buffer_value": r["buffer_value"], "delta": paired(r, ref),
                     "ontime": float(o["ontime"].mean()), "supply_shortfall": float(o["supply_shortfall"].mean()),
                     "delay": float(o["delay"].mean()), "rev_at_risk": float(o["rev_at_risk"].mean()), "lost": float(o["lost"].mean())})
    return rows


def optimise(n=8000, seed=99, levels=range(0, 7), max_sweeps=4, **kw):
    """
    Coordinate descent over the six buffer levels (3 modules x 2 products), maximising mean equity.
    Fitted on its own seed; evaluate the winner on a fresh seed to avoid the optimiser's curse.
    """
    shocks = S.draw_shocks(n, seed)
    cache = {}

    def score(b):
        key = tuple(itertools.chain(*(b[m] for m in A.MODULES)))
        if key not in cache:
            cache[key] = float(run_policy(b, shocks, n, **kw)["equity"].mean())
        return cache[key]

    best = A.uniform_buffers(0)
    best_val = score(best)
    trace = [{"sweep": 0, "buffers": {m: list(v) for m, v in best.items()}, "equity": best_val}]
    for sweep in range(1, max_sweeps + 1):
        improved = False
        for m, j in itertools.product(A.MODULES, range(len(A.PRODUCTS))):
            for lvl in levels:
                cand = {k: list(v) for k, v in best.items()}
                cand[m][j] = lvl
                v = score(cand)
                if v > best_val + 1e-6:
                    best, best_val, improved = cand, v, True
        trace.append({"sweep": sweep, "buffers": {m: list(v) for m, v in best.items()}, "equity": best_val})
        if not improved:
            break
    base = cache[tuple([0] * 6)]
    return {"buffers": best, "gain_in_sample": best_val - base, "evaluations": len(cache), "trace": trace}


# ---------------------------------------------------------------- sensitivity
def tornado(policy, shocks, n, lo=0.10, hi=0.90):
    """One prior at a time fixed at its P10 and P90; everything else (incl. shared stress) still random."""
    def metrics(over):
        r0 = run_policy(A.uniform_buffers(0), shocks, n, overrides=over)
        r1 = run_policy(policy, shocks, n, overrides=over)
        o = outcomes(r0)
        return {"price": float(o["price"].mean()), "supply_shortfall": float(o["supply_shortfall"].mean()),
                "policy_value": float((r1["equity"] - r0["equity"]).mean())}

    base = metrics({})
    rows = []
    for pr in A.PRIORS:
        a, b = float(pr.ppf(lo)), float(pr.ppf(hi))
        rows.append({"name": pr.name, "label": pr.label, "unit": pr.unit, "lo_value": a, "hi_value": b,
                     "lo": metrics({pr.name: a}), "hi": metrics({pr.name: b})})
    return {"base": base, "rows": rows, "quantiles": [lo, hi]}


def _rank(x):
    return np.argsort(np.argsort(x)).astype(float)


def global_sensitivity(r: dict, delta_equity: np.ndarray, bins=25):
    """
    Standardised rank-regression coefficients (SRRC) and binned first-order indices
    S1 = Var(E[Y | X_i]) / Var(Y) for parameters and the realised random drivers of each path.
    """
    o = outcomes(r)
    X = {p.name: r["params"][p.name] for p in A.PRIORS}
    X["D_mean"] = r["D"].mean(axis=1)
    X["D_2030"] = r["D"][:, -1]
    for i, m in enumerate(A.MODULES):
        X[f"down_{m}"] = r["disrupted_months"][:, i].astype(float)
    labels = {p.name: p.label for p in A.PRIORS}
    labels.update(D_mean="Realised demand multiplier (2027-30 mean)", D_2030="Realised demand multiplier, 2030",
                  **{f"down_{m}": f"Realised disruption months, {m}" for m in A.MODULES})
    names = list(X)
    Xm = np.column_stack([X[k] for k in names])
    Xr = np.column_stack([_rank(c) for c in Xm.T])
    Xr = (Xr - Xr.mean(0)) / Xr.std(0)
    out = {}
    for yname, y in (("price", o["price"]), ("supply_shortfall", o["supply_shortfall"]), ("policy_value", delta_equity)):
        yr = _rank(y)
        yr = (yr - yr.mean()) / yr.std()
        coef, *_ = np.linalg.lstsq(Xr, yr, rcond=None)
        r2 = 1 - ((yr - Xr @ coef) ** 2).mean()
        s1 = []
        vy = y.var()
        for c in Xm.T:
            if vy == 0:
                s1.append(0.0)
                continue
            edges = np.unique(np.quantile(c, np.linspace(0, 1, bins + 1)))
            idx = np.clip(np.searchsorted(edges, c, side="right") - 1, 0, len(edges) - 2)
            cnt = np.bincount(idx)
            means = np.bincount(idx, weights=y) / np.maximum(cnt, 1)
            s1.append(float(max(0.0, ((cnt * (means - y.mean()) ** 2).sum() / y.size - vy * (len(cnt) - 1) / y.size) / vy)))
        out[yname] = {"r2_rank": float(r2),
                      "rows": sorted([{"name": k, "label": labels[k], "srrc": float(b), "s1": s}
                                      for k, b, s in zip(names, coef, s1)], key=lambda d: -d["s1"])}
    return out


def uncertainty_split(shocks, n, policy):
    """Spread with parameters drawn (full) vs held at their means (randomness only)."""
    res = {}
    for mode in ("full", "central"):
        r = run_policy(policy, shocks, n, param_mode=mode)
        o = outcomes(r)
        res[mode] = {k: _stat(o[k]) for k in ("price", "supply_shortfall", "ontime", "rev_at_risk")}
    res["param_share_of_variance"] = {
        k: float(max(0.0, 1 - res["central"][k]["sd"] ** 2 / res["full"][k]["sd"] ** 2)) for k in res["full"]}
    return res


PERFECT_SUPPLY = {**{f"lam_{m}": 0.0 for m in A.MODULES}, **{f"yield_{m}": 1.0 for m in A.MODULES},
                  "ramp_2027": 1.0, "ramp_2028": 1.0, "exe_capacity": 1.45, "cancel_hazard": 0.0}


def cost_of_supply_risk(shocks, n, policy):
    """Same demand paths, but a supply chain that never fails and never runs out of capacity."""
    ideal = run_policy(A.uniform_buffers(0), shocks, n, overrides=PERFECT_SUPPLY)
    out = {}
    for label, b in (("none", A.uniform_buffers(0)), ("policy", policy)):
        r = run_policy(b, shocks, n)
        out[label] = paired(ideal, r)
    out["ideal_price"] = _stat(ideal["price"])
    return out


# ---------------------------------------------------------------- convergence and robustness
def convergence(r_big: dict, policy_delta: np.ndarray):
    o = outcomes(r_big)
    n = o["price"].size
    marks = np.unique(np.geomspace(200, n, 40).astype(int))
    trace = []
    for k in marks:
        p, s, d = o["price"][:k], (o["supply_shortfall"][:k] > 0.05), policy_delta[:k]
        trace.append({"n": int(k), "price_mean": float(p.mean()), "price_se": float(p.std(ddof=1) / np.sqrt(k)),
                      "p_short": float(s.mean()), "p_short_se": float(np.sqrt(s.mean() * (1 - s.mean()) / k)),
                      "policy_value": float(d.mean()), "policy_value_se": float(d.std(ddof=1) / np.sqrt(k))})
    return trace


def alternatives(policy, n, seed):
    """Do conclusions survive other plausible distributions and dependence assumptions?"""
    shocks = S.draw_shocks(n, seed)
    cases = [("Central case", {}), ("Gamma durations (same mean and variance)", {"duration": "gamma"}),
             ("Independent inputs (no shared stress)", {"stress_scale": 0.0}),
             ("Doubled dependence", {"stress_scale": 2.0}),
             ("Cancellation hazard x4 (2%/month)", {"overrides": {"cancel_hazard": 0.02}})]
    rows = []
    for label, kw in cases:
        uni = uniform_policies(shocks, n, levels=(0, 1, 2, 4), **kw)
        r0 = run_policy(A.uniform_buffers(0), shocks, n, **kw)
        r1 = run_policy(policy, shocks, n, **kw)
        o = outcomes(r0)
        best = max(uni, key=lambda u: u["delta"]["mean"])
        rows.append({"label": label, "price": _stat(o["price"]), "supply_shortfall": float(o["supply_shortfall"].mean()),
                     "p_short": float((o["supply_shortfall"] > 0.05).mean()), "policy": paired(r1, r0),
                     "best_uniform_k": best["k"], "uniform": [{"k": u["k"], "delta": u["delta"]["mean"]} for u in uni]})
    return rows


def breakeven_cancellation(policy, shocks, n, hazards=(0.0, 0.0025, 0.005, 0.01, 0.02, 0.04, 0.08)):
    """Value of buffering as customers get less patient (the monopoly assumption weakens)."""
    rows = []
    for h in hazards:
        kw = {"overrides": {"cancel_hazard": h}}
        r0 = run_policy(A.uniform_buffers(0), shocks, n, **kw)
        r1 = run_policy(policy, shocks, n, **kw)
        r2 = run_policy(A.uniform_buffers(2), shocks, n, **kw)
        rows.append({"hazard": h, "policy": paired(r1, r0)["mean"], "uniform2": paired(r2, r0)["mean"],
                     "lost_units": float(outcomes(r0)["lost"].mean())})
    return rows


# ---------------------------------------------------------------- chart series
def fan(x: np.ndarray):
    """Percentile bands over time for an array (T, N)."""
    q = np.percentile(x, [5, 25, 50, 75, 95], axis=1)
    return {"p5": q[0].tolist(), "p25": q[1].tolist(), "p50": q[2].tolist(), "p75": q[3].tolist(), "p95": q[4].tolist(),
            "mean": x.mean(axis=1).tolist()}


def histogram(x, bins=60, lo=None, hi=None):
    lo = float(np.percentile(x, 0.5)) if lo is None else lo
    hi = float(np.percentile(x, 99.5)) if hi is None else hi
    c, e = np.histogram(np.clip(x, lo, hi), bins=bins, range=(lo, hi))
    return {"edges": e.tolist(), "counts": c.tolist()}


def cdf(x, points=200):
    q = np.linspace(0, 1, points)
    return {"x": np.quantile(x, q).tolist(), "p": q.tolist()}

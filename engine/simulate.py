"""
Simulation logic: one path = 48 months (Jan 2027 - Dec 2030) of orders, supplier output, assembly and late orders.

Time is indexed by ship date. Assembly and test take a fixed L months, so modules for a system due in
month t must be ready L months earlier; with L fixed this is a pure relabelling and L drops out.

All randomness is drawn up front (draw_shocks) as uniforms and normals and turned into outcomes by
inverse CDFs. Two runs with the same seed therefore share every random number (common random
numbers), so the difference between two buffer policies is the policy, not noise.
"""
import numpy as np
from scipy import special

from . import assumptions as A
from . import dcf

T, Y, M, P = A.MONTHS, len(A.YEARS), len(A.MODULES), len(A.PRODUCTS)


# ---------------------------------------------------------------- random inputs
def draw_shocks(n: int, seed: int) -> dict:
    rng = np.random.Generator(np.random.PCG64(seed))
    return {
        "u_params": rng.random((n, len(A.PRIORS))),
        "eps": rng.standard_normal((T + 1, n)),      # stress innovations (row 0 = stationary start)
        "eta": rng.standard_normal((Y, n)),          # idiosyncratic demand shocks
        "u_arrive": rng.random((T, n, M)),
        "u_sev": rng.random((T, n, M)),
        "u_dur": rng.random((T, n, M)),
        "u_yield": rng.random((T, n, M, P)),
        "u_cancel": rng.random((T, n, P)),
    }


def draw_params(cfg: A.Config, u_params: np.ndarray) -> dict:
    out = {}
    for j, pr in enumerate(A.PRIORS):
        if pr.name in cfg.overrides:
            out[pr.name] = np.full(u_params.shape[0], float(cfg.overrides[pr.name]))
        elif cfg.param_mode == "central":
            out[pr.name] = np.full(u_params.shape[0], pr.central)
        else:
            out[pr.name] = pr.ppf(np.clip(u_params[:, j], 1e-12, 1 - 1e-12))
    return out


def binom_inv(u, n, p):
    """Inverse CDF of Binomial(n, p), vectorised. Monotone in u and n, which keeps common random numbers aligned."""
    u, p = np.broadcast_arrays(np.asarray(u, float), np.asarray(p, float))
    n = np.broadcast_to(np.asarray(n), u.shape).astype(np.int64)
    p = np.clip(p, 0.0, 1.0)
    full = p >= 1.0
    q = np.where(full, 1.0, 1.0 - p)
    ratio = np.where(full, 0.0, p / q)
    pmf = np.where(full, 0.0, q ** n)
    cdf = pmf.copy()
    out = np.zeros(u.shape, np.int64)
    active = (u > cdf) & (n > 0) & ~full
    k = 0
    while active.any():
        out += active
        pmf = pmf * (n - k) / (k + 1) * ratio
        k += 1
        cdf = cdf + pmf
        active &= (u > cdf) & (k < n)
    return np.where(full, n, out)


def stress_path(eps: np.ndarray) -> np.ndarray:
    """Industry stress S_t: stationary AR(1) with unit variance. Returns (T, N) for months 1..T."""
    phi = A.STRESS_PHI
    s = np.empty_like(eps)
    s[0] = eps[0]
    for t in range(1, eps.shape[0]):
        s[t] = phi * s[t - 1] + np.sqrt(1 - phi * phi) * eps[t]
    return s[1:]


def _annual_mean_sd(phi: float) -> float:
    i = np.arange(12)
    return float(np.sqrt((phi ** np.abs(i[:, None] - i[None, :])).sum()) / 12)


def demand_multiplier(params: dict, stress: np.ndarray, eta: np.ndarray, stress_scale: float) -> np.ndarray:
    """D_y (N, Y): lognormal, persistent across years, loaded on the yearly mean of stress."""
    zbar = stress.reshape(Y, 12, -1).mean(axis=1) / _annual_mean_sd(A.STRESS_PHI)     # (Y, N), unit variance
    g = np.minimum(params["gamma_demand"] * stress_scale, 0.95)
    sig, rho = params["sigma_demand"], A.DEMAND_RHO
    shock = np.sqrt(1 - g * g) * eta + g * zbar
    logd = np.empty_like(shock)
    logd[0] = sig * shock[0]
    for y in range(1, Y):
        logd[y] = rho * logd[y - 1] + sig * np.sqrt(1 - rho * rho) * shock[y]
    return np.clip(np.exp(logd), *A.DEMAND_LIMITS).T


def monthly_orders(D: np.ndarray) -> np.ndarray:
    """Whole-unit orders due per month (T, N, P). Cumulative rounding keeps yearly totals at plan x D."""
    plan = np.array([A.PLAN_UNITS[p] for p in A.PRODUCTS], float).T          # (Y, P)
    rate = np.repeat(D.T[:, :, None] * plan[:, None, :] / 12, 12, axis=0)     # (T, N, P)
    cum = np.floor(np.cumsum(rate, axis=0) + 1e-9)
    return np.diff(np.concatenate([np.zeros((1,) + cum.shape[1:]), cum]), axis=0).astype(np.int64)


def capacity(params: dict) -> np.ndarray:
    """ASML integration capacity, systems per month (Y, N, P)."""
    n = params["ramp_2027"].shape[0]
    c = np.empty((Y, n, P))
    c27 = A.NXE_CAPACITY_2026 * (1 + A.EXPANSION_STEP * params["ramp_2027"])
    c28 = c27 * (1 + A.EXPANSION_STEP * params["ramp_2028"])
    c[0, :, 0] = c27
    c[1:, :, 0] = c28
    exe_plan = np.array(A.PLAN_UNITS["EXE"], float)
    c[:, :, 1] = exe_plan[:, None] * params["exe_capacity"][None, :]
    return c / 12


# ---------------------------------------------------------------- dynamics
def core(orders, cap, lam, yld, beta, cancel, buffers, stress, shocks, *, disruptions=True,
         duration="lognormal", keep_paths=True, kappa=A.YIELD_STRESS_KAPPA):
    """
    Month-by-month flow for all paths at once.

    orders (T,N,P) units due · cap (Y,N,P) monthly integration capacity · lam (N,M) events/yr
    yld (N,M) qualification yield · beta (N,) stress sensitivity · cancel (N,) monthly hazard
    buffers (M,P) target safety stock · stress (T,N)
    """
    T, n = orders.shape[:2]
    B = np.asarray(buffers, np.int64)
    inv = np.broadcast_to(B, (n, M, P)).copy()          # buffers are in place at the start
    late = np.zeros((n, P), np.int64)
    bay_credit = np.zeros((n, P))
    sup_credit = np.zeros((n, M, P))
    remaining = np.zeros((n, M), np.int64)
    severity = np.zeros((n, M))
    dur_dist = A.duration_dist(duration)

    ship = np.zeros((T, n, P), np.int64)
    ontime = np.zeros((T, n, P), np.int64)
    lost = np.zeros((T, n, P), np.int64)
    produced = np.zeros((n, M, P), np.int64)
    disrupted = np.zeros((n, M), np.int64)
    late_t = np.zeros((T, n, P), np.int32) if keep_paths else None
    inv_t = np.zeros((T, n, M, P), np.int32) if keep_paths else None
    down_t = np.zeros((T, n, M), np.float32) if keep_paths else None

    for t in range(T):
        s = stress[t]
        # 1. supplier disruptions: Poisson hazard rising with stress; ignored while one is already running
        if disruptions:
            hazard = lam * np.exp(beta[:, None] * s[:, None]) / 12
            hit = (remaining == 0) & (shocks["u_arrive"][t] < 1 - np.exp(-hazard))
            if hit.any():   # inverse CDFs only where an event starts (they dominate run time otherwise)
                remaining[hit] = np.clip(np.ceil(dur_dist.ppf(shocks["u_dur"][t][hit])), 1, A.DURATION_CAP)
                severity[hit] = A.SEVERITY.ppf(shocks["u_sev"][t][hit])
        avail = np.where(remaining > 0, 1 - severity, 1.0)                     # (N, M)
        disrupted += remaining > 0

        # 2. what ASML can build this month: orders due + late orders, capped by integration bays
        due = orders[t] + late
        cb = cap[t // 12]
        bay_credit = np.minimum(bay_credit + cb, cb + 1)
        target = np.minimum(due, np.floor(bay_credit).astype(np.int64))

        # 3. suppliers produce to cover the build plus the gap to the buffer target, within capacity
        need = np.clip(target[:, None, :] + B[None] - inv, 0, None)
        request = np.ceil(need / yld[:, :, None] - 1e-9).astype(np.int64)
        cs = cb[:, None, :] * A.SUPPLIER_HEADROOM * avail[:, :, None]
        sup_credit = np.minimum(sup_credit + cs, cs + 1)
        started = np.minimum(np.floor(sup_credit).astype(np.int64), request)
        sup_credit -= started
        p_ok = yld[:, :, None] * np.exp(-kappa * np.maximum(s, 0))[:, None, None]
        good = binom_inv(shocks["u_yield"][t], started, p_ok)
        inv += good
        produced += good

        # 4. assembly needs one of each module (Leontief); late orders are served first
        built = np.minimum(inv.min(axis=1), target)
        inv -= built[:, None, :]
        bay_credit -= built
        ontime[t] = np.minimum(np.maximum(built - late, 0), orders[t])
        ship[t] = built
        late = due - built

        # 5. some customers cancel while they wait
        lost[t] = binom_inv(shocks["u_cancel"][t], late, cancel[:, None])
        late -= lost[t]
        remaining = np.maximum(remaining - 1, 0)

        if keep_paths:
            late_t[t], inv_t[t], down_t[t] = late, inv, 1 - avail

    return {"ship": ship, "ontime": ontime, "lost": lost, "late_end": late, "inv_end": inv, "produced": produced,
            "disrupted_months": disrupted, "late_t": late_t, "inv_t": inv_t, "down_t": down_t}


# ---------------------------------------------------------------- one full run
def run(cfg: A.Config, shocks: dict | None = None) -> dict:
    A.validate(cfg)
    shocks = shocks if shocks is not None else draw_shocks(cfg.n_paths, cfg.seed)
    n = shocks["u_params"].shape[0]
    prm = draw_params(cfg, shocks["u_params"])
    stress = stress_path(shocks["eps"])
    D = demand_multiplier(prm, stress, shocks["eta"], cfg.stress_scale)
    orders = monthly_orders(D)
    cap = capacity(prm)
    lam = np.stack([prm[f"lam_{m}"] for m in A.MODULES], axis=1)
    yld = np.stack([prm[f"yield_{m}"] for m in A.MODULES], axis=1)
    buffers = np.array([cfg.buffers[m] for m in A.MODULES])
    out = core(orders, cap, lam, yld, prm["beta_stress"] * cfg.stress_scale, prm["cancel_hazard"], buffers, stress,
               shocks, disruptions=cfg.disruptions, duration=cfg.duration, keep_paths=cfg.keep_paths,
               kappa=A.YIELD_STRESS_KAPPA * cfg.stress_scale)

    asp = np.array([A.ASP[p] for p in A.PRODUCTS], float).T                       # (Y, P)
    ship_y = out["ship"].reshape(Y, 12, n, P).sum(axis=1).transpose(1, 0, 2)      # (N, Y, P)
    orders_y = orders.reshape(Y, 12, n, P).sum(axis=1).transpose(1, 0, 2)
    lost_y = out["lost"].reshape(Y, 12, n, P).sum(axis=1).transpose(1, 0, 2)
    ontime_y = out["ontime"].reshape(Y, 12, n, P).sum(axis=1).transpose(1, 0, 2)
    euv_rev = (ship_y * asp).sum(axis=2)
    anchor_rev = (orders_y * asp).sum(axis=2)
    carry_rev = (out["late_end"] * asp[-1]).sum(axis=1)
    bval = A.buffer_value(cfg.buffers)
    val = dcf.value(euv_rev, anchor_rev, carry_rev, bval, prm["theta"], A.OBSOLESCENCE)

    return {"cfg": cfg, "params": prm, "D": D, "stress": stress, "orders_y": orders_y, "ship_y": ship_y,
            "lost_y": lost_y, "ontime_y": ontime_y, "euv_rev": euv_rev, "anchor_rev": anchor_rev,
            "carry_rev": carry_rev, "buffer_value": bval, "price": val["price"], "equity": val["equity"],
            "revenue": val["revenue"], "ufcf": val["ufcf"], "orders": orders, "cap": cap, **out}

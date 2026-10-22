"""Validation suite: hand calculation, deterministic reproduction of the DCF, invariants, boundaries."""
import importlib.util
import pathlib
import sys

import numpy as np
import pytest
from scipy import stats

from engine import assumptions as A
from engine import dcf, simulate as S
from engine import dcf_inputs as D

DETERMINISTIC = {**{f"lam_{m}": 0.0 for m in A.MODULES}, **{f"yield_{m}": 1.0 for m in A.MODULES},
                 "ramp_2027": 1.0, "ramp_2028": 1.0, "exe_capacity": 1.2, "sigma_demand": 0.0, "cancel_hazard": 0.0}


@pytest.fixture(scope="module")
def full_run():
    return S.run(A.Config(n_paths=4000, buffers=A.uniform_buffers(2)))


# ---------------------------------------------------------------- DCF link
def test_dcf_port_reproduces_base_price():
    assert dcf.base_price() == pytest.approx(D.BASE_PRICE_BLEND, abs=0.05)


def test_dcf_port_matches_sibling_repo_if_present():
    root = pathlib.Path(__file__).resolve().parents[2] / "DCF_model_web"
    if not (root / "model.py").exists():
        pytest.skip("asml-dcf-valuation repo not checked out next to this one")
    sys.path.insert(0, str(root))
    try:
        spec = importlib.util.spec_from_file_location("dcf_original", root / "model.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        orig = mod.run_case("Base")
    finally:
        sys.path.remove(str(root))
    port = dcf.value(dcf.base_segments()[0][None, 1:])
    assert port["price"][0] == pytest.approx(orig["blend"]["price"], rel=1e-12)
    assert port["revenue"][0] == pytest.approx([r["revenue"] for r in orig["rows"]], rel=1e-12)


def test_deterministic_simulation_ships_plan_and_reproduces_dcf():
    r = S.run(A.Config(n_paths=200, overrides=DETERMINISTIC, stress_scale=0.0))
    plan = np.array([A.PLAN_UNITS[p] for p in A.PRODUCTS]).T
    assert (r["ship_y"] == plan).all()
    assert (r["late_end"] == 0).all() and (r["lost_y"] == 0).all()
    assert r["price"] == pytest.approx(dcf.base_price(), rel=1e-12)


def test_delay_into_fy31_costs_only_time_value():
    base_euv = dcf.base_segments()[0][1:]
    asp30 = A.ASP["NXE"][-1]
    shifted = base_euv.copy()
    shifted[-1] -= asp30                         # one NXE ships in Jan 2031 instead of Dec 2030
    v = dcf.value(shifted[None], base_euv[None], np.array([asp30]))["price"][0]
    loss = (dcf.base_price() - v) * D.SHARES
    assert 0 < loss < 0.25 * asp30               # a one-system delay is worth far less than the system


# ---------------------------------------------------------------- hand-calculated example
def _toy(optics_buffer):
    """3 months, 2 NXE due per month, 3 bays, yields 1, optics hit by an 80% outage in month 2 for 1 month."""
    n_t = 3
    orders = np.zeros((n_t, 1, 2), np.int64)
    orders[:, 0, 0] = 2
    cap = np.array([[[3.0, 0.0]]])               # (Y=1, N=1, P=2) systems per month
    shocks = {
        "u_arrive": np.array([[[1.0, 1.0, 1.0]], [[0.5, 1.0, 1.0]], [[1.0, 1.0, 1.0]]]),
        "u_sev": np.full((n_t, 1, 3), A.SEVERITY.cdf(0.8)),
        "u_dur": np.full((n_t, 1, 3), 0.1),       # lognormal ppf(0.1) = 0.72 months -> 1 month
        "u_yield": np.full((n_t, 1, 3, 2), 0.5),
        "u_cancel": np.full((n_t, 1, 2), 0.5),
    }
    buffers = np.array([[optics_buffer, 0], [0, 0], [0, 0]])
    return S.core(orders, cap, lam=np.array([[1e6, 0.0, 0.0]]), yld=np.ones((1, 3)), beta=np.zeros(1),
                  cancel=np.zeros(1), buffers=buffers, stress=np.zeros((n_t, 1)), shocks=shocks)


def test_hand_calculation_with_buffer():
    # Month 1: build 2, optics stock back to 1, optics carries 1.3 units of capacity credit.
    # Month 2: optics capacity 3.3 x 0.2 = 0.66; credit min(1.3 + 0.66, 0.66 + 1) = 1.66 -> 1 started.
    #          stock 1 + 1 = 2 covers the 2 builds; buffer falls to 0.
    # Month 3: optics requests 2 + (1 - 0) = 3, credit 0.66 + 3.3 = 3.96 -> 3; buffer restored to 1.
    out = _toy(1)
    assert out["ship"][:, 0, 0].tolist() == [2, 2, 2]
    assert out["inv_end"][0, :, 0].tolist() == [1, 0, 0]
    assert out["late_end"][0, 0] == 0


def test_hand_calculation_without_buffer():
    # Month 2: only 1 optics module -> 1 system built, 1 order late.
    # Month 3: due 2 + 1 late = 3; bays have 3 - 1 + 3 = 5 -> capped at 3 + 1 = 4; optics starts 3 -> 3 built.
    out = _toy(0)
    assert out["ship"][:, 0, 0].tolist() == [2, 1, 3]
    assert out["ontime"][:, 0, 0].tolist() == [2, 1, 2]
    assert out["late_end"][0, 0] == 0


# ---------------------------------------------------------------- invariants
def test_order_conservation(full_run):
    r = full_run
    orders = r["orders_y"].sum(axis=1)
    assert (orders == r["ship_y"].sum(axis=1) + r["lost_y"].sum(axis=1) + r["late_end"]).all()


def test_inventory_conservation(full_run):
    r = full_run
    b = np.array([r["cfg"].buffers[m] for m in A.MODULES])
    shipped = r["ship_y"].sum(axis=1)[:, None, :]
    assert (r["inv_end"] == b[None] + r["produced"] - shipped).all()


def test_no_negative_stocks_or_backlog(full_run):
    assert r_min(full_run["inv_t"]) >= 0 and r_min(full_run["late_t"]) >= 0
    assert (full_run["ontime_y"] <= full_run["orders_y"]).all()


def r_min(x):
    return int(x.min())


def test_revenue_identity(full_run):
    r = full_run
    asp = np.array([A.ASP[p] for p in A.PRODUCTS]).T
    assert r["euv_rev"] == pytest.approx((r["ship_y"] * asp).sum(axis=2))


# ---------------------------------------------------------------- boundaries
def test_zero_capacity_ships_nothing():
    n_t, n = 12, 50
    rng = np.random.default_rng(0)
    orders = rng.integers(0, 4, (n_t, n, 2))
    shocks = {k: rng.random(s) for k, s in [("u_arrive", (n_t, n, 3)), ("u_sev", (n_t, n, 3)), ("u_dur", (n_t, n, 3)),
                                            ("u_yield", (n_t, n, 3, 2)), ("u_cancel", (n_t, n, 2))]}
    out = S.core(orders, np.zeros((1, n, 2)), np.full((n, 3), 0.2), np.full((n, 3), 0.95), np.zeros(n),
                 np.full(n, 0.01), np.zeros((3, 2)), np.zeros((n_t, n)), shocks)
    assert out["ship"].sum() == 0
    assert (out["late_end"] + out["lost"].sum(0) == orders.sum(0)).all()


def test_more_buffer_never_lowers_mean_on_time_delivery():
    shocks = S.draw_shocks(3000, 7)
    fill = [S.run(A.Config(n_paths=3000, buffers=A.uniform_buffers(k), keep_paths=False), shocks)["ontime_y"].sum()
            for k in (0, 1, 2, 4)]
    assert fill == sorted(fill)


def test_binom_inv_matches_scipy():
    rng = np.random.default_rng(1)
    u, n, p = rng.random(20000), rng.integers(0, 40, 20000), rng.random(20000)
    ref = stats.binom.ppf(u, n, p)
    assert (S.binom_inv(u, n, p) == ref).mean() > 0.9999        # equal up to floating-point ties


def test_stress_is_stationary_unit_variance():
    s = S.stress_path(np.random.default_rng(3).standard_normal((S.T + 1, 40000)))
    assert s.std(axis=1) == pytest.approx(np.ones(S.T), abs=0.03)


def test_same_seed_is_reproducible():
    a = S.run(A.Config(n_paths=500, keep_paths=False))["price"]
    b = S.run(A.Config(n_paths=500, keep_paths=False))["price"]
    assert (a == b).all()


# ---------------------------------------------------------------- input validation
@pytest.mark.parametrize("cfg, msg", [
    (A.Config(n_paths=10), "n_paths"),
    (A.Config(param_mode="best"), "param_mode"),
    (A.Config(duration="weibull"), "duration"),
    (A.Config(buffers={"optics": [1, 1]}), "buffers needs"),
    (A.Config(buffers={**A.uniform_buffers(0), "laser": [-1, 0]}), "laser"),
    (A.Config(overrides={"lam_zeiss": 0.1}), "unknown override"),
    (A.Config(overrides={"yield_optics": 1.4}), "<= 1"),
])
def test_bad_config_raises_helpful_error(cfg, msg):
    with pytest.raises(ValueError, match=msg):
        A.validate(cfg)

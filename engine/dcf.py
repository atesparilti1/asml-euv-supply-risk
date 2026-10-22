"""
Vectorised port of the ASML DCF Base case (one valuation per simulated path).

Same structure as the original model.py: FY26-FY30 explicit forecast, FY31-FY35 fade in which
growth steps linearly from the FY30 rate to terminal g with ratios held at FY30, then a terminal
value that blends Gordon growth and an exit EV/EBITDA multiple 50/50.

Three hooks connect it to the supply-chain simulation:
  * FY27-FY30 EUV revenue comes from simulated shipments instead of the plan.
  * The fade is anchored on demand-implied revenue, so a supply-driven dip in FY30 delays revenue
    rather than lowering the terminal value forever. Orders still late at the end of FY30 are
    shipped in FY31 (carry-over revenue).
  * Buffer inventory adds to net working capital from FY27, and its obsolescence and handling cost
    is an operating expense every year (it lasts into the terminal value).
"""
from datetime import date

import numpy as np

from . import dcf_inputs as D

N_YEARS = len(D.FY) + len(D.FADE)


def wacc() -> float:
    mcap = D.PRICE * D.SHARES
    beta = D.BETA_IND_U * (1 + (1 - D.TAX_MARG) * D.DEBT / mcap)   # regression weight is 0 in the Base case
    ke = D.RF + beta * D.ERP
    kd_at = (D.RF + D.SPREAD) * (1 - D.TAX_MARG)
    we = mcap / (mcap + D.DEBT)
    return we * ke + (1 - we) * kd_at + D.WACC_ADJ


def periods():
    y0 = (date(*D.FY1_END) - date(*D.VALUATION_DATE)).days / 365
    yf = np.array([y0 + i for i in range(N_YEARS)])
    disc = np.concatenate([[yf[0] / 2], yf[1:] - 0.5]) if D.MID_YEAR else yf.copy()
    return yf, disc


def base_segments():
    """Base revenue build FY26-FY30, split into EUV systems (NXE + EXE) and everything else."""
    R, B = D.REV_BASE, D.REV_BASE_2025
    prev = {"odv": B["odv"], "mi": B["mi"], "ib": B["ib"]}
    euv, other = [], []
    for i in range(5):
        lvl = {k: prev[k] * (1 + R[k + "_g"][i]) for k in prev}
        prev = lvl
        euv.append(R["nxe_u"][i] * R["nxe_p"][i] + R["exe_u"][i] * R["exe_p"][i])
        other.append(R["arfi_u"][i] * R["arfi_p"][i] + lvl["odv"] + lvl["mi"] + lvl["ib"])
    return np.array(euv), np.array(other)


def _ratio(series):
    return np.array(list(series) + [series[-1]] * len(D.FADE))


def value(euv_rev, anchor_euv_rev=None, carry_rev=None, buffer_value=0.0, theta=None, obsolescence=0.0):
    """
    Value every path.

    euv_rev         (N, 4) EUV system revenue FY27-FY30 from simulated shipments, EUR m
    anchor_euv_rev  (N, 4) demand-implied EUV revenue FY27-FY30 (what customers ordered), anchors the fade
    carry_rev       (N,)   revenue from orders still late at end FY30, recognised in FY31
    buffer_value    float  module inventory held as buffer, EUR m (NWC from FY27)
    theta           (N,)   EBITDA margin points lost per 100% EUV revenue shortfall vs plan (operating leverage)
    obsolescence    float  annual cost of holding the buffer, share of its value
    """
    euv_rev = np.atleast_2d(np.asarray(euv_rev, dtype=float))
    n = euv_rev.shape[0]
    anchor_euv_rev = euv_rev if anchor_euv_rev is None else np.atleast_2d(anchor_euv_rev)
    carry_rev = np.zeros(n) if carry_rev is None else np.asarray(carry_rev, dtype=float)
    theta = np.zeros(n) if theta is None else np.asarray(theta, dtype=float)

    base_euv, other = base_segments()
    rev = np.empty((n, N_YEARS))
    rev[:, 0] = base_euv[0] + other[0]
    rev[:, 1:5] = other[1:] + euv_rev

    # fade: growth from the demand-implied FY30 rate to terminal g, ratios held at FY30
    anchor29 = other[3] + anchor_euv_rev[:, 2]
    anchor30 = other[4] + anchor_euv_rev[:, 3]
    g30 = anchor30 / anchor29 - 1
    prev = anchor30
    for k in range(1, D.FADE_YEARS + 1):
        prev = prev * (1 + g30 + (D.G - g30) * k / D.FADE_YEARS)
        rev[:, 4 + k] = prev
    rev[:, 5] += carry_rev

    em = np.tile(_ratio(D.EBITDA_M), (n, 1))
    shortfall = np.clip(1 - euv_rev / base_euv[1:], 0, None)
    em[:, 1:5] -= theta[:, None] * shortfall

    ebitda = rev * em
    ebitda[:, 1:] -= obsolescence * buffer_value
    da = rev * _ratio(D.DA_PCT)
    ebit = ebitda - da
    nopat = ebit * (1 - _ratio(D.TAX))
    capex = rev * _ratio(D.CAPEX_PCT)
    nwc = rev * _ratio(D.NWC_PCT)
    nwc[:, 1:] += buffer_value
    dnwc = np.diff(np.concatenate([np.full((n, 1), D.NWC_2025), nwc], axis=1), axis=1)
    ufcf = nopat + da - capex - dnwc

    w = wacc()
    yf, disc = periods()
    cf = ufcf.copy()
    cf[:, 0] -= D.H1_UFCF              # H1-26 cash flow is already in the 28 Jun cash balance
    sum_pv = (cf / (1 + w) ** disc).sum(axis=1)
    tn = yf[-1]
    bridge = D.CASH - D.DEBT + D.NONOP
    tv_g = ufcf[:, -1] * (1 + D.G) / (w - D.G)
    tv_x = ebitda[:, -1] * D.EXIT_MULT
    eq_g = sum_pv + tv_g / (1 + w) ** tn + bridge
    eq_x = sum_pv + tv_x / (1 + w) ** tn + bridge
    equity = D.GORDON_WEIGHT * eq_g + (1 - D.GORDON_WEIGHT) * eq_x
    return {"price": equity / D.SHARES, "equity": equity, "price_gordon": eq_g / D.SHARES,
            "price_exit": eq_x / D.SHARES, "revenue": rev, "ebitda": ebitda, "ufcf": ufcf, "wacc": w}


def base_price() -> float:
    base_euv, _ = base_segments()
    return float(value(base_euv[None, 1:])["price"][0])

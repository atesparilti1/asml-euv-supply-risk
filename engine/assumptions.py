"""
Every input of the simulation, in one place.

Tags:
  SOURCED       taken from the ASML DCF Base case (which cites ASML filings) or ASML statements
  ILLUSTRATIVE  analyst judgement. Supplier lead times, yields and disruption rates are not published,
                so these are plausible values with stated ranges, not measurements.

Parameter uncertainty (epistemic) is a PRIORS entry: one value is drawn per path. Randomness inside a
path (aleatory) uses the fixed distributions further down. Change values here; everything else reads
from this module.
"""
from dataclasses import dataclass, field

import numpy as np
from scipy import stats

from . import dcf_inputs as D

# ---------------------------------------------------------------- run settings
SEED = 2026
N_PATHS = 20_000
YEARS = [2027, 2028, 2029, 2030]
MONTHS = 12 * len(YEARS)
PRODUCTS = ["NXE", "EXE"]                 # low-NA and High-NA EUV
MODULES = ["optics", "source", "laser"]   # Zeiss projection optics, Cymer light source, Trumpf drive laser

# ---------------------------------------------------------------- SOURCED (DCF Base case, FY27-FY30)
PLAN_UNITS = {"NXE": D.REV_BASE["nxe_u"][1:], "EXE": D.REV_BASE["exe_u"][1:]}
ASP = {"NXE": D.REV_BASE["nxe_p"][1:], "EXE": D.REV_BASE["exe_p"][1:]}   # EUR m per system
NXE_CAPACITY_2026 = 65.0     # ASML Q2-26 release: ~65 low-NA EUV systems of capacity in 2026
EXPANSION_STEP = 0.30        # +30% planned for 2027, a further +30% under study for 2028

# ---------------------------------------------------------------- ILLUSTRATIVE fixed assumptions
SUPPLIER_HEADROOM = 1.10     # each supplier line is sized 10% above ASML's integration capacity
MODULE_COST = {              # EUR m per module, share of the ~EUR 125m cost of goods of an NXE
    "NXE": [40.0, 18.0, 7.0],
    "EXE": [64.0, 28.8, 11.2],   # 1.6x NXE
}
OBSOLESCENCE = 0.05          # yearly handling, re-qualification and obsolescence cost, share of buffer value
STRESS_PHI = 0.90            # monthly persistence of the industry-stress factor
DEMAND_RHO = 0.60            # year-to-year persistence of the demand multiplier
YIELD_STRESS_KAPPA = 0.03    # yield falls by ~3% per unit of positive stress
DEMAND_LIMITS = (0.6, 1.5)   # demand multiplier is clipped to this band
DURATION_CAP = 18            # months; a disruption longer than this is treated as a redesign, out of scope
SEVERITY = stats.beta(2, 3)  # share of capacity lost while a disruption is active (mean 0.40)
DURATION_MEDIAN, DURATION_SIGMA = 2.0, 0.8   # lognormal months, heavy right tail


def duration_dist(kind: str = "lognormal"):
    """Disruption duration in months. 'gamma' matches the lognormal's mean and variance (alternative check)."""
    if kind == "lognormal":
        return stats.lognorm(s=DURATION_SIGMA, scale=DURATION_MEDIAN)
    if kind == "gamma":
        m, v = stats.lognorm(s=DURATION_SIGMA, scale=DURATION_MEDIAN).stats()
        return stats.gamma(a=float(m * m / v), scale=float(v / m))
    raise ValueError(f"duration kind must be 'lognormal' or 'gamma', got {kind!r}")


# ---------------------------------------------------------------- ILLUSTRATIVE priors (parameter uncertainty)
@dataclass(frozen=True)
class Prior:
    name: str
    label: str
    unit: str
    dist: object          # frozen scipy distribution
    why: str
    tag: str = "ILLUSTRATIVE"

    @property
    def central(self) -> float:
        return float(self.dist.mean())

    def ppf(self, u):
        return self.dist.ppf(u)


PRIORS = [
    Prior("lam_optics", "Disruption rate, optics (Zeiss)", "events/yr", stats.gamma(2, scale=0.075),
          "Rare events at a mature single-source supplier. Gamma(2) prior because the rate itself is uncertain (mean 0.15)."),
    Prior("lam_source", "Disruption rate, light source (Cymer)", "events/yr", stats.gamma(2, scale=0.125),
          "Most complex module (tin-droplet plasma), highest rate (mean 0.25)."),
    Prior("lam_laser", "Disruption rate, drive laser (Trumpf)", "events/yr", stats.gamma(2, scale=0.10),
          "High-power CO2 laser, mean 0.20."),
    Prior("yield_optics", "Qualification yield, optics", "share", stats.beta(92, 8),
          "Mirrors need picometre surface accuracy, so optics are the hardest to pass (mean 0.92)."),
    Prior("yield_source", "Qualification yield, light source", "share", stats.beta(95, 5), "Mean 0.95."),
    Prior("yield_laser", "Qualification yield, drive laser", "share", stats.beta(97, 3), "Most mature module, mean 0.97."),
    Prior("ramp_2027", "Share of the 2027 +30% NXE capacity step achieved", "share", stats.beta(8, 2),
          "Ramps usually land a little short of plan (mean 0.80). Bounded on [0, 1]."),
    Prior("ramp_2028", "Share of the 2028 +30% NXE capacity step achieved", "share", stats.beta(6, 3),
          "Only under study in 2026, so less certain (mean 0.67)."),
    Prior("exe_capacity", "High-NA capacity relative to plan", "x plan", stats.beta(5, 3, loc=0.85, scale=0.45),
          "High-NA capacity is not published; mean 1.13x plan, can fall below plan (min 0.85)."),
    Prior("beta_stress", "Disruption sensitivity to industry stress", "log-rate per sd", stats.uniform(0.3, 0.5),
          "Strained suppliers fail more often. A one-sd stress month multiplies the hazard by e^beta."),
    Prior("gamma_demand", "Demand loading on industry stress", "correlation", stats.uniform(0.2, 0.6),
          "Boom years bring both more orders and more supplier stress."),
    Prior("sigma_demand", "Demand volatility", "log sd", stats.uniform(0.06, 0.08),
          "Year-level EUV order uncertainty around the DCF plan (central 10%)."),
    Prior("cancel_hazard", "Late-order cancellation hazard", "per month", stats.beta(2, 398),
          "ASML is the only EUV supplier, so customers mostly wait (mean 0.5%/month)."),
    Prior("theta", "Operating leverage", "margin per 100% shortfall", stats.triang(c=1 / 3, loc=0.10, scale=0.15),
          "Fixed R&D and fab cost: a 10% EUV revenue shortfall costs ~1.7 points of EBITDA margin (mean)."),
]
PRIOR_NAMES = [p.name for p in PRIORS]
PRIOR_BY_NAME = {p.name: p for p in PRIORS}
PLANNING_YIELD = np.array([PRIOR_BY_NAME[f"yield_{m}"].central for m in MODULES])   # what ASML plans with


# ---------------------------------------------------------------- run configuration
@dataclass
class Config:
    n_paths: int = N_PATHS
    seed: int = SEED
    buffers: dict = field(default_factory=lambda: {m: [0, 0] for m in MODULES})   # module -> [NXE, EXE] sets
    param_mode: str = "full"          # "full": draw priors per path; "central": hold them at their means
    overrides: dict = field(default_factory=dict)   # prior name -> fixed value (tornado, validation)
    duration: str = "lognormal"       # or "gamma"
    stress_scale: float = 1.0         # multiplies beta_stress and gamma_demand: 0 = independent, 2 = doubled
    disruptions: bool = True
    keep_paths: bool = True           # keep monthly arrays for fan charts


def uniform_buffers(k: int) -> dict:
    return {m: [k, k] for m in MODULES}


def buffer_value(buffers: dict) -> float:
    return float(sum(buffers[m][j] * MODULE_COST[p][i] for i, m in enumerate(MODULES) for j, p in enumerate(PRODUCTS)))


def validate(cfg: Config) -> None:
    """Fail early with a message that says what to change."""
    if not isinstance(cfg.n_paths, int) or cfg.n_paths < 100:
        raise ValueError(f"n_paths must be an integer >= 100 (got {cfg.n_paths!r}); fewer paths cannot estimate tails.")
    if cfg.n_paths > 500_000:
        raise ValueError(f"n_paths={cfg.n_paths} would need several GB of memory; use <= 500,000 or run in batches.")
    if cfg.param_mode not in ("full", "central"):
        raise ValueError(f"param_mode must be 'full' or 'central', got {cfg.param_mode!r}.")
    duration_dist(cfg.duration)
    if not 0 <= cfg.stress_scale <= 3:
        raise ValueError(f"stress_scale must be within [0, 3] (got {cfg.stress_scale}); gamma_demand x scale must stay <= 1.")
    if set(cfg.buffers) != set(MODULES):
        raise ValueError(f"buffers needs exactly the modules {MODULES}, got {sorted(cfg.buffers)}.")
    for m, b in cfg.buffers.items():
        if len(b) != len(PRODUCTS) or any((not float(x).is_integer()) or x < 0 or x > 50 for x in b):
            raise ValueError(f"buffers[{m!r}] must be two whole numbers in 0..50 (NXE, EXE sets), got {b!r}.")
    for k, v in cfg.overrides.items():
        if k not in PRIOR_BY_NAME:
            raise ValueError(f"unknown override {k!r}; valid names: {', '.join(PRIOR_NAMES)}.")
        if not np.isfinite(v) or v < 0:
            raise ValueError(f"override {k}={v} must be a finite, non-negative number.")
        if (k.startswith("yield_") or k.startswith("ramp_") or k == "cancel_hazard") and v > 1:
            raise ValueError(f"override {k}={v} is a probability or share and must be <= 1.")

# ASML EUV supply-chain risk: a Monte Carlo study

**How much spare stock of critical EUV modules should ASML hold?** Every EUV scanner needs projection optics (Zeiss), a light
source (Cymer) and a drive laser (Trumpf), each from a single source. This project simulates 20,000 versions of 2027–2030 month by
month and values every path through the Base case of my [ASML DCF](https://atesparilti1.github.io/asml-dcf-valuation/). The
simulated futures include supplier outages, failed qualifications, capacity ramps that fall short, and demand that moves together
with supplier stress.

**Live site:** https://atesparilti1.github.io/asml-euv-supply-risk/ (with an in-browser simulator)

## The answer

| Policy | Stock held | Equity value vs no buffer (95% CI) | On-time delivery |
|---|---:|---:|---:|
| No buffer | €0m | – | 57% |
| 2 spare sets of every module | €338m | −€193m (−€197m to −€188m) | 69% |
| **Recommended: 2 NXE light sources, 5 NXE + 1 EXE drive lasers, no optics** | **€82m** | **+€59m (+€55m to +€62m)** | **63%** |

* **Buffer what is cheap and fragile, never the expensive optics.** ASML is the only EUV supplier, so a late machine is mostly a
  delayed sale, not a lost one. Stock that ties up cash rarely pays for itself unless it is cheap.
* **Supply-chain risk costs about €0.94bn of equity value (€2.44 a share)** compared with a supply chain that never fails. It
  cannot explain the gap between the DCF (€935) and the market price (€1,611).
* **The decision depends most on the drive-laser and light-source outage rates and on how strongly failures cluster.** With
  independent inputs the buffer is worth only +€9m; with doubled dependence, +€131m. Uniform buffers only pay once waiting
  customers cancel about 4% of orders a month, 8× the central assumption.

Supplier reliability data is not public. Every supplier input is a labelled **illustrative** prior with a stated range, and the
sensitivity analysis shows which of them the answer depends on. Simulated outcomes are not predictions.

## Run it

```bash
pip install -r requirements.txt
python -m pytest -q          # 22 validation tests (~3 s)
python run.py --quick        # 4,000 paths, ~45 s
python run.py                # full study: 20,000 paths, optimisation, sensitivity, convergence (~6 min)

cd web && npm install
npm test                     # browser engine vs Python reference
npm run dev                  # site at http://localhost:5173
```

`run.py` prints the headline numbers and writes `web/src/data/results.json` (read by the site) plus
`web/public/downloads/` (a 5,000-path CSV sample and the assumptions as JSON).

To change an assumption, edit `engine/assumptions.py`. It holds every input, its distribution and why it was chosen. Invalid
settings fail early with a message that says what to change.

## How it works

| Layer | File | What it does |
|---|---|---|
| Assumptions | `engine/assumptions.py` | Sourced inputs, illustrative priors (scipy distributions), run config, input validation |
| DCF link | `engine/dcf.py`, `engine/dcf_inputs.py` | Vectorised port of the DCF Base case; reproduces its €935.30 exactly |
| Simulation | `engine/simulate.py` | Stress factor, demand, outages, binomial yields, Leontief assembly, late orders, cancellations |
| Analysis | `engine/analysis.py` | Statistics with Monte Carlo error, policy optimisation, tornado, Sobol-style indices, convergence, robustness |
| Presentation | `run.py`, `web/` | Exports, React/TypeScript site with KaTeX math, TypeScript engine in a Web Worker |

**One path:** draw parameters from their priors, then 48 months of: industry stress (AR(1)) → orders (lognormal, persistent,
loaded on stress) → supplier outages (Poisson hazard rising with stress; Beta severity; lognormal duration) → module output
(capacity-capped base-stock requests, binomial qualification) → assembly (one of each module, capped by integration bays) → late
orders and cancellations. Shipments replace the plan in FY27–30 of the DCF. The fade is anchored on demand-implied revenue, so supply
delays shift value in time rather than lowering the terminal value forever. Buffers add to working capital and cost 5% a year to hold.

**Common random numbers:** all randomness is drawn up front as uniforms and turned into outcomes by inverse CDFs. Every policy sees
the same paths, so policy differences are paired and precise (±€1.7m standard error on a ±€240m per-path spread).

**Optimisation:** coordinate descent over six buffer levels (3 modules × 2 products), fitted on seed 99 and evaluated on the
independent main seed to avoid the optimiser's curse. A refit on seed 101 differs only in one light source, where the value surface is flat.

## Validation

* Deterministic case (no outages, 100% yields, ample capacity, demand at plan) ships the plan exactly and reproduces the DCF
  price to 12 significant digits, also checked against the original repository when it is checked out alongside.
* A hand-worked three-month example with an 80% optics outage, with and without a spare, asserted step by step.
* Identities on every path: orders = shipped + cancelled + late; stock = buffer + good output − used; no negative stock or backlog.
* Boundaries: zero capacity ships nothing; more buffer never lowers on-time delivery; a one-system delay into 2031 costs only time value.
* Convergence: 20,000 vs 40,000 paths on a new seed changes the buffer value by a few million euros and not the decision.
* Alternatives: gamma vs lognormal outage durations (no change), independent vs doubled dependence (changes the size of the value), higher cancellation.
* The TypeScript engine agrees with Python within four standard errors (price €938.7 vs €938.5; buffer value +€56.7m vs +€58.6m).

See [docs/methodology.md](docs/methodology.md) for the full write-up.

---
Ates Parilti · Industrial Engineering, TU Eindhoven · [atesparilti.com](https://atesparilti.com) · not investment advice

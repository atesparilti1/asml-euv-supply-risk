# Methodology: ASML EUV supply-chain Monte Carlo

## 1. Decision and outputs

**Decision.** The buffer level B(m,p): how many spare modules of each critical type m (optics, light source, drive laser) ASML
holds for each EUV product p (NXE low-NA, EXE High-NA).

**Primary metric.** Expected equity value (EUR m) relative to holding no buffer, measured on common random numbers. Reported
alongside it: on-time delivery, average delay per system, the share of orders unshipped by December 2030, the probability of more
than 5% unshipped, ordered EUV revenue not shipped, and CVaR (the average of the worst 5% of paths).

**Horizon and step.** 48 months, January 2027 to December 2030. FY2026 is held at the DCF Base case because most of it is already
reported. Time is indexed by ship date; the fixed build-and-test time L only relabels the calendar.

## 2. Model

* **Stress.** S_t = φ S_{t−1} + √(1−φ²) ε_t with φ = 0.9: stationary, unit variance, persistent.
* **Demand.** log D_y = ρ log D_{y−1} + σ_D √(1−ρ²) (√(1−γ²) η_y + γ S̄_y), with ρ = 0.6 and S̄_y the standardised yearly mean
  of stress. D_y is clipped to [0.6, 1.5]. Orders due per month come from cumulative rounding of plan × D / 12, so yearly totals are exact.
* **Outages.** Hazard λ_m e^{β S_t}, monthly start probability 1 − e^{−hazard/12}. Severity δ ~ Beta(2,3) and duration
  ⌈Lognormal(ln 2, 0.8)⌉ months, capped at 18. An outage hits both product lines; a new one cannot start while one is running.
* **Module output.** Requests r = ⌈(target + B − I)⁺ / π_m⌉. Starts are capped by a capacity credit that accrues 1.1 × ASML monthly
  capacity × availability, capped at one month plus one unit so lost capacity cannot be banked. Good output is Binomial(starts,
  π_m e^{−κ S_t⁺}), with κ = 0.03.
* **Assembly.** a = min(optics, source, laser stock, target), with target = min(due + late, integration-bay credit). Late orders are
  served first. Each month a waiting order is cancelled with probability h.
* **Capacity.** NXE: 65 × (1 + 0.3 ρ₁) in 2027, then × (1 + 0.3 ρ₂) from 2028, following ASML's stated 2026 capacity and its two
  +30% steps. EXE: plan × U.
* **Valuation.** Simulated shipments × ASP replace the plan in FY27–30. EBITDA margin falls by θ × the EUV revenue shortfall
  versus plan (operating leverage). The FY31–35 fade starts from demand-implied FY30 revenue; orders still late at the end of FY30
  are recognised in FY31. Buffer value V_B enters NWC from FY27 and costs 5% of V_B a year in EBITDA, forever. WACC (9.38%),
  terminal growth (2.5%), the exit multiple (20×) and the 50/50 Gordon/exit blend are unchanged from the DCF.

## 3. Assumptions

Sourced (via the DCF, which cites ASML's 2025 20-F and 2026 releases): planned NXE 75/82/86/88 and EXE 10/14/18/22 systems,
ASPs, 2026 low-NA capacity of ~65 systems with +30% steps, and every DCF driver.

Illustrative priors (parameter uncertainty, one draw per path):

| Parameter | Distribution | Mean |
|---|---|---|
| Outage rate, optics / source / laser (per year) | Gamma(2, 0.075 / 0.125 / 0.10) | 0.15 / 0.25 / 0.20 |
| Qualification yield, optics / source / laser | Beta(92,8) / Beta(95,5) / Beta(97,3) | 0.92 / 0.95 / 0.97 |
| Share of 2027 / 2028 capacity step achieved | Beta(8,2) / Beta(6,3) | 0.80 / 0.67 |
| High-NA capacity relative to plan | Beta(5,3) on [0.85, 1.30] | 1.13 |
| Stress sensitivity of outages β | Uniform(0.3, 0.8) | 0.55 |
| Demand loading on stress γ | Uniform(0.2, 0.8) | 0.50 |
| Demand volatility σ_D | Uniform(0.06, 0.14) | 0.10 |
| Monthly cancellation hazard h | Beta(2, 398) | 0.5% |
| Operating leverage θ | Triangular(0.10, 0.15, 0.25) | 0.167 |

Fixed illustrative inputs: supplier headroom 1.1×; module costs for NXE of €40m (optics), €18m (source) and €7m (laser), with EXE at
1.6× those; a 5% holding cost a year.

## 4. Simulation design

* 20,000 paths, seed 2026 (NumPy PCG64). Every random number is drawn up front as uniforms and normals and turned into outcomes
  by inverse CDFs, so every policy shares the same paths.
* Monte Carlo standard errors are reported for every mean and probability. Policy differences are paired.
* Optimisation: coordinate descent over the six buffer levels in 0..6, on seed 99 with 8,000 paths; then evaluated on the main seed.
  A refit on seed 101 checks stability.
* Convergence: running means ± 1.96 SE on 40,000 fresh paths (seed 2027), compared with the main run.

## 5. Results (20,000 paths)

* Value per share: mean €938.5 (SE 0.69), median €929.6, P5 €794, P95 €1,109. P(below the DCF base) = 52.5%.
* No buffer: 376 of 397 ordered systems ship by the end of 2030 (4.8% unshipped); 57% ship in their due month; average delay 1.06 months.
* Recommended buffers (2 NXE light sources, 5 NXE + 1 EXE drive lasers, €82m): +€58.6m (95% CI +€55.2m to +€61.9m); on-time 63%.
  The buffer costs money in 55% of paths and pays off heavily in the rest, much like insurance.
* Uniform buffers of 1, 2, 3, 4 and 6 sets change value by −€46m, −€193m, −€373m, −€572m and −€1,001m.
* Cost of supply-chain risk versus a perfect supply chain on the same demand paths: €0.94bn (€2.44 a share).

## 6. Sensitivity

* Tornado (each prior at its P10 and then P90, everything else random): the buffer's value ranges from −€6m to +€139m across the
  laser outage rate. The light-source rate, the two capacity steps and operating leverage follow.
* First-order indices from quantile binning: price variance is mostly realised 2030 demand (S₁ ≈ 0.64, since it anchors the
  terminal value). Unshipped orders depend on demand and outage months. The buffer's value depends on realised laser outage months (S₁ ≈ 0.32).
* Parameter uncertainty explains 6% of price variance and 24% of unshipped-order variance. The rest is randomness that better data cannot remove.

## 7. Validation

The 22 Python tests and 9 browser tests are described in the README. Robustness:

| Assumption set | Value of recommended buffers | Best uniform level |
|---|---:|---:|
| Central | +€59m | 0 |
| Gamma outage durations (same mean and variance) | +€57m | 0 |
| Independent inputs | +€9m | 0 |
| Doubled dependence | +€131m | 1 |
| Cancellation hazard 2%/month | +€114m | 1 |

## 8. Limitations

* Supplier inputs are judgement, not data. Laser and light-source reliability and the strength of clustering are the first things to measure.
* Not modelled: supplier lead-time pipelines, second sourcing, ASP uncertainty, the DUV and services businesses, customer goodwill
  and contract penalties. All but the last two would mostly change timing; the last two would raise the value of buffers.
* Valuation levels inherit the DCF's demand and terminal assumptions; this model changes the timing of EUV revenue, not the long-run thesis.

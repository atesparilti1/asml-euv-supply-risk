"""
Snapshot of the Base case of the ASML DCF (github.com/atesparilti1/asml-dcf-valuation, data/inputs.py).

Only the numbers this simulator needs are copied. Every value is REPORTED (ASML filings), MARKET
or a DCF Base-case ASSUMPTION documented in that repo. tests/test_dcf.py checks that the vectorised
DCF in engine/dcf.py reproduces the original Base price (EUR 935.3 blended) exactly, and compares
against the sibling repo directly when it is checked out next to this one.
"""

# ---------------------------------------------------------------- dates and conventions
VALUATION_DATE = (2026, 10, 7)
FY1_END = (2026, 12, 31)
MID_YEAR = True
GORDON_WEIGHT = 0.5
FADE_YEARS = 5
FY = [2026, 2027, 2028, 2029, 2030]
FADE = [2031, 2032, 2033, 2034, 2035]

# ---------------------------------------------------------------- FY2025 base (REPORTED, 20-F 2025)
REVENUE_2025 = 32667.3
# NWC FY25 = (current assets - cash - STI - current loans receivable) - (current liabilities - current debt)
#            - non-current contract liabilities = (30616.1 - 12916.0 - 405.9 - 266.1) - (24263.9 - 1681.9) - 3366.3
NWC_2025 = (30616.1 - 12916.0 - 405.9 - 266.1) - (24263.9 - 1681.9) - 3366.3
REV_BASE_2025 = {"nxe_u": 44, "nxe_rev": 10445.8, "exe_u": 4, "exe_rev": 1156.9, "arfi_u": 131, "arfi_rev": 10311.4,
                 "odv": 1735.6, "mi": 824.6, "ib": 8193.0}

# ---------------------------------------------------------------- Base revenue drivers FY26..FY30
REV_BASE = {"nxe_u": [65, 75, 82, 86, 88], "nxe_p": [255, 260, 265, 270, 275],
            "exe_u": [8, 10, 14, 18, 22], "exe_p": [350, 360, 370, 380, 390],
            "arfi_u": [130, 145, 150, 145, 140], "arfi_p": [86, 87, 89, 91, 93],
            "odv_g": [0.0, 0.0, 0.0, 0.0, 0.0], "mi_g": [0.20, 0.10, 0.08, 0.06, 0.05],
            "ib_g": [0.30, 0.12, 0.10, 0.08, 0.07]}

# ---------------------------------------------------------------- Base operating drivers FY26..FY30
EBITDA_M = [0.410, 0.420, 0.425, 0.430, 0.430]
DA_PCT = [0.028, 0.028, 0.028, 0.028, 0.028]
CAPEX_PCT = [0.055, 0.055, 0.055, 0.055, 0.055]
NWC_PCT = [-0.120, -0.120, -0.120, -0.120, -0.120]
TAX = [0.175, 0.175, 0.175, 0.175, 0.175]
G = 0.025
EXIT_MULT = 20.0
WACC_ADJ = 0.0

# ---------------------------------------------------------------- market and balance sheet (MARKET / REPORTED)
PRICE = 1611.40
SHARES = 384.9
CASH = 7581.5
DEBT = 3697.7
NONOP = 2310.7
H1_UFCF = -1290.9

# ---------------------------------------------------------------- cost of capital inputs
RF = 0.0351
ERP = 0.0423
BETA_IND_U = 1.39
TAX_MARG = 0.258
SPREAD = 0.0060

BASE_PRICE_BLEND = 935.3   # rounded output of the original model, for tests and the site

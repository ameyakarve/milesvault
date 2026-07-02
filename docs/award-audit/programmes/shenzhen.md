# Shenzhen Airlines — Phoenix Miles

- **Engine module id:** `shenzhen`
- **KG slug (`slug` export):** `shenzhen-phoenix-miles`
- **Airline / IATA:** Shenzhen Airlines (ZH)
- **Alliance:** Star Alliance
- **File header note:**
  ```
  Shenzhen Phoenix Miles — Uses Air China PhoenixMiles chart

  ZH is a subsidiary of Air China. Shenzhen Airlines uses the same
  PhoenixMiles award chart as Air China. Since both programmes share
  the same pricing, this module delegates to the phoenixmiles chart
  but outputs under the "shenzhen" programme name.

  The vault Shenzhen Phoenix Miles award chart file explicitly references
  the Air China PhoenixMiles chart for all pricing.

  Star Alliance bookable airlines: same subset as PhoenixMiles.
  Only limited route data is published in the vault.

  Source: vault Award Charts/Shenzhen Phoenix Miles.md
  HOW TO REFRESH: Update if Shenzhen diverges from Air China chart
  ```
- **File size:** 113 lines

## Bookable carriers
Count: 26. `A3, AC, AI, AV, BR, CA, CM, ET, LH, LO, LX, MS, NH, NZ, OS, OU, OZ, SA, SN, SQ, TG, TK, TP, UA, VL, ZH`
Own-metal carriers used for chart selection: `ZH`

## Pricing model
- **Structure:** Zone-pair chart, structurally identical to (and per the file header, copied from) the Air China PhoenixMiles chart, output under the "shenzhen" programme label.
- **Distance bands / zones:** 12-zone map (letters A–L, with gaps — no C/D/E/K in the header's own comment vs. the literal object, which actually defines A,B,C,D,E,F,G,H,I,J,L) keyed by country code: CN→A; HK/MO/TW→B; JP/KR/MN/KP→C; Thailand/Singapore/Malaysia/Indonesia/Philippines/Vietnam/Myanmar/Cambodia/Laos/Brunei→D; South Asia + parts of Central Asia (IN, BD, BT, LK, NP, PK, MV, AM, AZ, KG, TJ, UZ)→E; Europe + Turkey/Russia/Ukraine/Belarus→F; AU/NZ→G; US/CA→H; South America (BR, AR, CL, CO, PE)→I; Mexico/Central America/Caribbean (MX, GT, PA, CU, DO)→J; Middle East + parts of Africa (AE, SA, QA, KW, OM, ZA, ET, KE, NG, EG)→L. Only a subset of zone pairs are populated: 3 own-metal rows (A-H, A-F, L-F) and 5 partner rows (A-H, A-F, H-B, H-C, H-G).
- **Own vs partner:** `resolveChart(legs, ZH_CARRIERS)` (shared helper) classifies the itinerary as `"own"` (every specified leg carrier is ZH), `"partner"` (no specified leg carrier is ZH), or `"both"` (mixed). The own table (`ZH_OWN`) is consulted when chart !== "partner"; the partner table (`ZH_PTR`) is consulted when chart !== "own" — so a "both" itinerary can yield both entries.
- **Seasons:** None — all entries carry `season: "standard"`.
- **Cabins:** Business is priced on every populated row. Economy is populated on all own-metal rows and the `A-H`/`A-F` partner rows, but is explicitly `null` on the partner rows `H-B`, `H-C`, `H-G` (business/first only). First is populated on all rows except the partner row `A-F`, where it is `null`. Premium_economy is always `null`.
- **Chart selection:** Origin/destination country codes resolve to zones via `getZone()`; if either side has no zone, `handle()` returns `[]`. The order-independent `pairKey(oz, dz)` is looked up in `ZH_OWN` and/or `ZH_PTR` per the `resolveChart` outcome.

## Output entries
`handle()` can return up to two entries: `{chart: "own", season: "standard"}` and `{chart: "partner", season: "standard"}`, each with fixed `[v,v]` values (not true ranges) for economy/business/first taken directly from the `ZH_OWN`/`ZH_PTR` tables; premium_economy is always null. Both entries hardcode `programme: "shenzhen"` — matching the module's dir name but differing from the KG slug `shenzhen-phoenix-miles`.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

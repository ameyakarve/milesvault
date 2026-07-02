# Alaska Airlines — Atmos Rewards

- **Engine module id:** `atmos`
- **KG slug (`slug` export):** `atmos-rewards`
- **Airline / IATA:** Alaska Airlines (AS)
- **Alliance:** oneworld
- **File header note:**
  ```
  Atmos Rewards (Alaska Airlines) — Distance-based with regional charts

  - Own-metal (AS/HA): 5-band distance chart
  - Partner: 3 regional charts (Americas, EMEA, Asia-Pacific) with 6 bands each

  Region selection: if either origin or destination is in Asia-Pacific, use APAC chart.
  Otherwise if either is in EMEA, use EMEA chart. Otherwise Americas.

  Source: vault Award Charts/Atmos Rewards.md
  ```
- **File size:** 99 lines

## Bookable carriers
Count: 23. `AA, AS, AT, AY, BA, CX, DE, EI, FI, FJ, HU, IB, JL, JX, KE, MH, PD, QF, QR, RJ, TN, UL, WY`
Own-metal carriers used for chart selection: `AS, HA` (the `OWN_CARRIERS` set — Alaska Airlines and Hawaiian Airlines)

## Pricing model
- **Structure:** distance-band whole-journey chart. Own-metal uses one 5-band table; partner uses one of three regional 6-band tables selected by a simple origin/destination-country region mapping.
- **Distance bands / zones:** Own-metal: `OWN_BANDS = [700, 1400, 2100, 3500, Infinity]` → `OWN_CHART` rows of `[economy, first]` only. Americas partner: `AM_BANDS = [700, 1400, 2100, 4000, 6000, Infinity]` → `[econ, premEcon, biz, first]`. EMEA partner: `EMEA_BANDS = [1500, 3500, 5000, 7000, 10000, Infinity]`. Asia-Pacific partner: `APAC_BANDS = [1500, 3000, 5000, 7000, 10000, Infinity]`. Region mapping (`REGION`) assigns countries to `AM`/`EMEA`/`APAC`, defaulting unmapped countries to `AM`.
- **Own vs partner:** pure carrier check — if the itinerary has at least one carrier and every leg carrier is in `OWN_CARRIERS`, the own-metal chart is used; otherwise the partner path runs. There is no "both" combination path.
- **Seasons:** none — every entry uses `season: "default"`.
- **Cabins:** own-metal prices economy and first only (premium_economy and business always `null`); partner prices all four cabins.
- **Chart selection:** `getRegion(originCC, destCC)` looks at only the first leg's origin country and the last leg's destination country (not every leg): if either maps to APAC, use the APAC chart; else if either maps to EMEA, use EMEA; else use Americas. `resolveBand(totalDistance, bands)` then picks the row.

## Output entries
Exactly one entry per call: either `{chart: "own", season: "default", economy, first}` (business/premium_economy `null`) or `{chart: "partner", season: "default", economy, premium_economy, business, first}`. All values are fixed `[v,v]` pairs. The `programme` field passed to `makeEntry` is `"atmos"`, which differs from the `slug` export `"atmos-rewards"`.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

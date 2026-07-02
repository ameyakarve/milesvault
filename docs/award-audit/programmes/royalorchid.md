# Thai Airways — Royal Orchid Plus

- **Engine module id:** `royalorchid`
- **KG slug (`slug` export):** `royal-orchid-plus`
- **Airline / IATA:** Thai Airways (TG), with Thai Smile (WE) included as own-metal
- **Alliance:** Star Alliance
- **File header note:**
  ```
  Royal Orchid Plus (Thai Airways) — Zone-based charts

  TG own-metal: zone-based from Bangkok (direct and connecting)
  Partner (Star Alliance): 12-zone asymmetric matrix, one-way

  All partner chart values stored in tenths of thousands (e.g., 175 = 17,500 miles).
  Multiply by 100 before returning.

  Source: vault Award Charts/Royal Orchid Plus/
  HOW TO REFRESH: Update TG_DIRECT, TG_CONNECTING, PTR_* matrices below
  ```
- **File size:** 270 lines

## Bookable carriers
Count: 26. `A3, AC, AI, AV, BR, CA, CM, ET, LH, LO, LX, MS, NH, NZ, OS, OU, OZ, SA, SN, SQ, TG, TK, TP, UA, VL, ZH`
Own-metal carriers used for chart selection: `TG, WE` (`TG_CARRIERS`).

## Pricing model
- **Structure:** hybrid, both sides zone-based (no distance bands anywhere).
  - TG own-metal: zone-from-Bangkok chart, split into `TG_DIRECT` and `TG_CONNECTING` tables depending on whether the itinerary includes a domestic Thailand (TH–TH) segment.
  - Partner (Star Alliance): a 12×12 asymmetric zone matrix, one set of tables per cabin (`PTR_ECO`, `PTR_PE`, `PTR_BIZ`, `PTR_FIRST`), indexed `[originZone-1][destZone-1]`.
- **Distance bands / zones:**
  - TG zone map (`TG_ZONE`): 10 distinct codes (`DOM`, `1`–`9`) plus a hardcoded special zone `"7a"` assigned only via the Perth-airport check — 11 zone codes in total.
  - Partner zone map (`PTR_ZONE`): 12 numbered zones (`1`–`12`), with China split between zone 2 (a fixed list of "southern" airport codes) and zone 4 (fallback for Beijing/northern China), and Hawaii mapped to zone 8 via a fixed airport-code set (`HAWAII_AIRPORTS`) when the country is `US`.
  - Partner chart values are stored as integers described as "in hundreds"/"tenths of thousands" in comments and multiplied by 100 in `handle()` to produce final mileage values.
- **Own vs partner:** `resolveChart(legs, TG_CARRIERS)` gates both branches. TG own-metal is only computed if Thailand (`TH`) is one endpoint of the itinerary; the "foreign" country's `TG_ZONE` value is used, with two hardcoded overrides: Perth (`AU` + `PER` airport) forces zone `"7a"`, and any China (`CN`) endpoint is hardcoded to zone `2` regardless of the actual airport (comment: "Simplified... Default to zone 2 for China"). Partner pricing looks up origin/destination zones via `getPtrZone`/`getCnPtrZone` independently of the TH-endpoint requirement.
- **Seasons:** the label used is always `"default"` — no peak/off-peak distinction exists in code for either chart.
- **Cabins:** TG own-metal (`TG_DIRECT`/`TG_CONNECTING`) rows are `[economy, premium_economy, business, first]`, with several `null` entries per zone (e.g. zone `3` has no premium_economy, zone `"7a"` has no premium_economy or first). Partner matrices populate all four cabins for essentially every zone pair.
- **Chart selection:** TG own-metal picks `TG_CONNECTING` over `TG_DIRECT` only when the itinerary has more than one leg, includes a TH–TH domestic segment, and the resolved zone isn't `"DOM"`. Partner pricing indexes the four cabin matrices by `[originZone-1][destZone-1]`; if the economy cell is `undefined`, no partner entry is added.

## Output entries
`handle()` can return up to two entries: chart `"tg_operated"` (season `"default"`) from the TG own-metal lookup, and chart `"partner"` (season `"default"`) from the Star Alliance matrix lookup. All cabin values are wrapped as `[v, v]` (partner values additionally multiplied by 100) — fixed values, not true `[min, max]` ranges.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

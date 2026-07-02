# Air France–KLM — Flying Blue

- **Engine module id:** `flyingblue`
- **KG slug (`slug` export):** `flying-blue`
- **Airline / IATA:** Air France / KLM (AF / KL)
- **Alliance:** SkyTeam — the `BOOKABLE` set (AF, AM, AR, BT, CI, CM, DL, EY, G3, GA, JL, KE, KL, KQ, LY, ME, MF, MH, MK, MU, PG, QF, RO, SK, SV, UX, VN, VS, WS, WY) is a SkyTeam-and-partners list consistent with Flying Blue's award chart.
- **File header note:** none — the file's docblock has no `Source:` / `HOW TO REFRESH:` lines. Verbatim header present:
  ```
  Flying Blue — Fully dynamic pricing

  Returns published minimum floor prices by route category.
  All values are [min, min] since actual pricing is dynamic and unknown.
  The chart type is "dynamic_floor" to indicate these are minimums, not fixed rates.
  ```
- **File size:** 109 lines

## Bookable carriers
Count: 30. `AF, AM, AR, BT, CI, CM, DL, EY, G3, GA, JL, KE, KL, KQ, LY, ME, MF, MH, MK, MU, PG, QF, RO, SK, SV, UX, VN, VS, WS, WY`
Own-metal carriers used for chart selection: n/a — `handle()` does not inspect leg carrier identity at all; pricing depends only on the origin/destination country's region.

## Pricing model
- **Structure:** region-pair, fully dynamic placeholder. The module returns published minimum "floor" figures rather than an actual chart, per the header note that Flying Blue prices are dynamic/revenue-based.
- **Distance bands / zones:** `FB_REGION` maps country codes into 6 regions: `EU`, `NA_AF` (North Africa, treated as Europe-adjacent), `NAM`, `AP` (Asia-Pacific and Middle East combined into one region), `AF` (sub-Saharan Africa), `CSA` (Central & South America and the Caribbean).
- **Own vs partner:** n/a — no own/partner distinction; the same region-floor lookup applies regardless of which carrier is on the itinerary.
- **Seasons:** none — the single entry always uses season `"default"`.
- **Cabins:** the `FLOORS` table rows are `[economy, premEcon, business]`; first is always absent/`null`. Several region pairs (e.g. `EU-EU`, `AP-AP`, `CSA-CSA`, `NA_AF-NA_AF`, `NAM-NAM`) have premium_economy `null`; explicitly-published pairs are `EU-EU, EU-NA_AF, EU-NAM, AP-EU, AF-EU, CSA-EU, AP-AP, AP-NAM, CSA-CSA, NA_AF-NA_AF, NAM-NAM`; the remaining pairs (`AF-NAM, AF-AP, CSA-NAM, AF-CSA, CSA-AP, AF-NA_AF, CSA-NA_AF, NAM-NA_AF`) are marked in-code as "not explicitly published — use conservative estimates".
- **Chart selection:** `floorKey(r1, r2)` sorts the two region codes alphabetically and looks up the corresponding row in `FLOORS`; if either endpoint's country doesn't resolve to a region, or the sorted pair has no row, `handle()` returns `[]`.

## Output entries
`handle()` returns at most one entry, chart `dynamic_floor`, season `"default"`, built as a literal object. Values are fixed `[v, v]` pairs (all so-called "minimums" per the header, duplicated into `[v,v]`), not true `[min, max]` ranges. The module exports `published = false`, with an in-code comment stating this is because "Flying Blue prices awards dynamically (revenue-based) with no published chart or bounds — any chart figure here is a misleading floor," so downstream consumers are meant to surface this programme's cabins as "dynamic (varies — confirm live)" rather than as a number, notwithstanding that `handle()` itself still returns concrete numeric `[min,min]` pairs. The `programme` field is hardcoded as `"flyingblue"`, matching the module id but differing in format from the `slug` export `"flying-blue"`.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

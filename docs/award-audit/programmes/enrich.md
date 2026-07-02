# Malaysia Airlines — Enrich

- **Engine module id:** `enrich`
- **KG slug (`slug` export):** `enrich`
- **Airline / IATA:** Malaysia Airlines (MH)
- **Alliance:** oneworld — the `BOOKABLE` set matches oneworld carriers (AA, AS, AT, AY, BA, CX, FJ, IB, JL, MH, QF, QR, RJ, UL, WY).
- **File header note:** none — the file's docblock has no `Source:` / `HOW TO REFRESH:` lines. Verbatim header present:
  ```
  Enrich (Malaysia Airlines) — Distance-based partner chart
  MH own-metal uses city-pair Saver pricing (too granular, return [0,0])
  Partner: 7-band distance chart, one-way
  ```
- **File size:** 25 lines

## Bookable carriers
Count: 15. `AA, AS, AT, AY, BA, CX, FJ, IB, JL, MH, QF, QR, RJ, UL, WY`
Own-metal carriers used for chart selection: `MH` (`MH_CARRIERS` set, single member) — used only to detect and *skip* own-metal pricing, not to price it.

## Pricing model
- **Structure:** distance-band whole-journey, single flat partner chart applied uniformly to any non-MH carrier (the module does not branch by which partner carrier is involved).
- **Distance bands / zones:** one 7-band distance array (miles): `[500, 1200, 2400, 4800, 7200, 10000, Infinity]`.
- **Own vs partner:** if every specified leg carrier is `MH`, `handle()` returns a single fixed `[0,0]` placeholder entry (chart `own_dynamic`), per the header comment that MH own-metal uses "city-pair Saver pricing (too granular, return [0,0])". Otherwise — any non-MH carrier present, or no carrier specified at all — the generic 7-band partner chart is applied regardless of which specific partner operates the flight.
- **Seasons:** none — the single entry always uses season `"default"`.
- **Cabins:** `CHART` rows have 3 values destructured as `[e, b, f]` → economy, business, first priced (via `makeEntry(..., e, null, b, f)`); premium_economy is always `null`.
- **Chart selection:** `resolveBand(totalDistance, BANDS)` picks one of the 7 rows in `CHART`; there is no further branching on origin/destination or partner identity.

## Output entries
`handle()` always returns exactly one entry: either chart `own_dynamic` (MH-only itineraries, fixed `[0,0]` economy/business, premium_economy and first `null`) or chart `partner` (all other cases), season `"default"` in both cases. All values are fixed `[v, v]` pairs, not true ranges (`makeEntry`'s `wrap` helper always duplicates the single input value). The `programme` field is hardcoded as `"enrich"`, matching both the module id and the `slug` export.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

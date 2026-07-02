# Cathay Pacific — Asia Miles

- **Engine module id:** `asiamiles`
- **KG slug (`slug` export):** `asia-miles`
- **Airline / IATA:** Cathay Pacific (CX)
- **Alliance:** oneworld
- **File header note:** none (no Source/HOW TO REFRESH docblock).
- **File size:** 61 lines

## Bookable carriers
Count: 25. `AA, AC, AS, AT, AY, BA, CA, CX, FJ, IB, JL, LA, LH, LX, MH, NZ, OS, PG, QF, QR, RJ, UL, UO, WY, ZH`
Own-metal carriers used for chart selection: `CX, KA` (the `CX_CARRIERS` set — includes `KA`, the former Cathay Dragon/Dragonair code, alongside `CX`)

## Pricing model
- **Structure:** distance-band whole-journey chart (a single global distance-band array applied to total journey distance, not zone-based), with a "Type 2 country" adjustment that substitutes a different chart row for one specific band.
- **Distance bands / zones:** `AM_BANDS = [750, 2750, 5000, 7500, Infinity]` (5 nominal bands). Two 6-row chart tables exist — `AM_CATHAY` (own-metal) and `AM_PTR` (partner) — each with one extra row beyond the 5 bands: for band index 1 (distance ≤ 2750), row 1 is used by default, or row 2 is used instead if the itinerary touches a "Type 2" country (`AM_TYPE2_COUNTRIES = {BD, IN, ID, JP, NP, LK}`).
- **Own vs partner:** `resolveChart(legs, CX_CARRIERS)` yields `own`/`partner`/`both`; own-metal draws from `AM_CATHAY`, partner from `AM_PTR`, using the same band/Type-2 row logic for both. Itineraries with 2 or more distinct non-CX/KA carriers return `[]` (only single-partner-plus-CX combinations are handled).
- **Seasons:** none — every entry uses `season: "default"`.
- **Cabins:** economy, premium_economy, business, first are all priced on both tables; `AM_CATHAY` row 0 has `first: null`, all other rows on both tables are fully populated.
- **Chart selection:** `bandIdx = resolveBand(distance, AM_BANDS)`; `arrIdx = bandIdx === 0 ? 0 : bandIdx + 1` (shifts by one to make room for the Type-2 variant row). When `bandIdx === 1` specifically, the row used is index 2 if `isType2(legs)` else index 1; other bands use `arrIdx` directly.

## Output entries
Up to 2 entries — a `"cathay"` (own-metal) entry and/or a `"partner"` entry, both `season: "default"`, built via `makeEntry` as fixed `[v,v]` pairs (never true ranges). The `programme` field passed to `makeEntry` is `"asiamiles"`, which differs from the `slug` export `"asia-miles"`.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

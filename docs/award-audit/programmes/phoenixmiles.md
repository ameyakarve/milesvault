# Air China — PhoenixMiles

- **Engine module id:** `phoenixmiles`
- **KG slug (`slug` export):** `phoenixmiles`
- **Airline / IATA:** Air China (CA)
- **Alliance:** Star Alliance
- **File header note:**
  ```
  Air China PhoenixMiles — Zone-based chart

  CA own-metal: 12-zone system. Round-trip pricing with seasonal variation.
    Only selected routes published in vault (China-USA, China-Europe, ME/AF-Europe).

  Star Alliance partner: separate zone-based chart, limited published data.
    Only selected routes published (China-USA, China-Europe, USA-HK/TW, USA-JP/KR, USA-Oceania).

  Currency unit is "kilometers" (not miles), functions identically to miles.
  One-way costs more than 50% of round-trip.

  Source: vault Award Charts/Air China PhoenixMiles.md
  HOW TO REFRESH: Update zone maps and charts below
  ```
- **File size:** 121 lines

## Bookable carriers
Count: 14. `AC, AI, BR, CA, ET, LH, LX, NH, OS, OZ, SQ, TK, UA, VL`
(File comment labels this "Star Alliance subset that CA books (13)"; the actual `BOOKABLE` set contains 14 codes.)
Own-metal carriers used for chart selection: `CA` (`CA_CARRIERS`).

## Pricing model
- **Structure:** zone-pair, with separate own-metal and partner tables. Both tables store one-way figures directly (the file's inline comments show the round-trip-to-one-way halving arithmetic, e.g. "100K/200K/280K RT → 50K/100K/140K OW", but the stored constants are already the one-way numbers).
- **Distance bands / zones:** no distance bands. The `ZONE` map assigns country codes to 11 distinct zone letters: `A, B, C, D, E, F, G, H, I, J, L` (header comment describes a "12-zone system"; no zone `K` is present in the map). Both `CA_OWN` and `CA_PTR` only cover a small, explicitly-listed set of zone pairs (e.g. `A–H`, `A–F`, `L–F` for own-metal; `A–H`, `A–F`, `H–B`, `H–C`, `H–G` for partner) — most zone-pair combinations have no entry.
- **Own vs partner:** `resolveChart(legs, CA_CARRIERS)` returns `"own"`/`"partner"`/`"both"`; if not `"partner"`, `CA_OWN` is checked for the zone pair; if not `"own"`, `CA_PTR` is checked.
- **Seasons:** the single label used is `"standard"` (the header mentions "seasonal variation" for CA own-metal, but no season branching or additional season keys exist in code).
- **Cabins:** economy, business, first are priced from the 3-value rows (`[e, biz, f]`); premium_economy is always `null`. Some partner rows omit economy or first (stored as `null`, e.g. `A–F` has no first, `H–B`/`H–C`/`H–G` have no economy).
- **Chart selection:** origin/destination country codes mapped through `ZONE` via `getZone(cc)`; if either is unmapped, `handle()` returns `[]` immediately (before checking own vs. partner). The zone pair is looked up via `pairKey` in `CA_OWN` and/or `CA_PTR`.

## Output entries
`handle()` can return up to two entries: chart `"own"` (season `"standard"`) if the CA-operated zone pair has a row, and chart `"partner"` (season `"standard"`) if the Star Alliance zone pair has a row. All present cabin values are wrapped as `[v, v]` from a single stored number — fixed values, not true `[min, max]` ranges.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

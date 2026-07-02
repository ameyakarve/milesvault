# EVA Air — Infinity MileageLands

- **Engine module id:** `eva`
- **KG slug (`slug` export):** `infinity-mileagelands`
- **Airline / IATA:** EVA Air (BR)
- **Alliance:** Star Alliance — the file header explicitly labels the `BOOKABLE` list "Star Alliance (26)", and the set (A3, AC, AI, AV, BR, CA, CM, ET, LH, LO, LX, MS, NH, NZ, OS, OU, OZ, SA, SN, SQ, TG, TK, TP, UA, VL, ZH) matches Star Alliance membership.
- **File header note:**
  ```
  Infinity MileageLands (EVA Air) — Zone-based chart

  BR own-metal: zone-based from Taiwan, no seasonal variation.
    All prices round-trip; one-way = 50%. No First class on EVA.
    Chicago (ORD), New York (JFK), Houston (IAH), Toronto (YYZ) cost 10K more.

  Star Alliance partner: 14-zone matrix, no Premium Economy.
    All prices round-trip; one-way = 50%.

  Source: vault Award Charts/Infinity MileageLands/
  HOW TO REFRESH: Update zone maps and charts below
  ```
- **File size:** 308 lines

## Bookable carriers
Count: 26. `A3, AC, AI, AV, BR, CA, CM, ET, LH, LO, LX, MS, NH, NZ, OS, OU, OZ, SA, SN, SQ, TG, TK, TP, UA, VL, ZH`
Own-metal carriers used for chart selection: `BR` (`BR_CARRIERS` set, single member).

## Pricing model
- **Structure:** zone-pair, hybrid — two independent zone systems (own-metal from Taiwan; Star Alliance partner 14-zone matrix), both authored directly as one-way figures (the header notes the vault source is round-trip and "one-way = 50%", but the constants in `BR_OWN`/`PTR` are pre-halved one-way values with no runtime division).
- **Distance bands / zones:**
  - Own-metal (`BR_ZONE`, keyed by country code, 6 zones): `TW`, `HKMAC` (Hong Kong/Macau), `ASIA`, `OC` (Australia/NZ), `AM` (US/Canada/Mexico), `EU`.
  - Partner (`PTR_ZONE`, keyed by country code, ~15 zones): `TW`, `HK_MAC`, `CHINA`, `N_ASIA`, `SE_ASIA`, `CS_ASIA`, `SW_PAC`, `N_AM`, `HI_CAM` (Hawaii/Central America), `S_AM`, `EU`, `M_EAST`, `N_AF`, `CS_AF`. A Hawaii-airport override (`HNL, OGG, KOA, LIH, ITO`) reclassifies Hawaii routes from `N_AM` to `HI_CAM`.
- **Own vs partner:** `resolveChart(legs, BR_CARRIERS)` classifies the itinerary as `"own"`, `"partner"`, or `"both"`. Own-metal pricing is attempted (`chart !== "partner"`) by looking up `BR_OWN[pairKey(oz, dz)]`; not every zone pair is populated (e.g. `OC`–`EU` has no row), so an unpopulated pair yields no own-metal entry even when own-metal is applicable. A surcharge of +5,000 per priced cabin is added when the Americas zone (`AM`) is one endpoint (and not both) and a leg touches `ORD`, `JFK`, `IAH`, or `YYZ`. Partner pricing is attempted (`chart !== "own"`) only when the two partner zones differ (`oz !== dz`); same-zone entries defined in `PTR` (`TW-TW`, `EU-EU`, `N_AM-N_AM`, all zero) are therefore never reached by this guard.
- **Seasons:** none — all entries use season `"default"`.
- **Cabins:** own-metal (`BR_OWN`) rows are `[economy, premEcon, business]` — priced per the header note "No First class on EVA"; first is always `null`. Partner (`PTR`) rows are `[economy, business, first]` — premium_economy is always `null` per the header note "no Premium Economy".
- **Chart selection:** both charts resolve via `pairKey(zoneA, zoneB)` lookups into their respective flat rate tables (`BR_OWN`, `PTR`), keyed by unordered zone pair.

## Output entries
`handle()` can return 0–2 entries: chart `own` (EVA own-metal) and chart `partner` (Star Alliance), both season `"default"`, both built as literal objects (not via `makeEntry`). All values are fixed `[v, v]` pairs, not true ranges. The `programme` field is hardcoded as `"eva"` on both entries, matching the module id but differing in format from the `slug` export `"infinity-mileagelands"`.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

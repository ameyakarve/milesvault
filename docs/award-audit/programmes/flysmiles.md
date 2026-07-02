# SriLankan Airlines — FlySmiLes

- **Engine module id:** `flysmiles`
- **KG slug (`slug` export):** `flysmiles`
- **Airline / IATA:** SriLankan Airlines (UL)
- **Alliance:** oneworld
- **File header note:**
  ```
  FlySmiLes (SriLankan Airlines) — Zone-based chart

  UL own-metal: zone-based from Colombo (10 zones)
  Partner (oneworld): separate zone-based chart

  The vault file has limited published rates — only known minimum (7,000 one-way)
  and one upgrade example. Full zone-to-zone chart is not publicly available
  in detail, so we use the known rates where available and return [] for unknown pairs.

  Source: vault Award Charts/FlySmiLes.md
  HOW TO REFRESH: Update zone maps and chart data below
  ```
- **File size:** 142 lines

## Bookable carriers
Count: 17 (see note below on set construction). Named codes: `AA, AS, AT, AY, BA, CX, FJ, IB, JL, MH, QF, QR, RJ, UL, EY, WY` (16 codes).

Note: the `BOOKABLE` array literal contains a double comma (`"UL",,"EY"`), an elision. When spread into the `Set`, this elision is iterated as an `undefined` value, so `BOOKABLE.size` is actually 17: the 16 named codes above plus one `undefined` entry.

Own-metal carriers used for chart selection: `UL` (`UL_CARRIERS`).

## Pricing model
- **Structure:** Zone-pair (single zone table keyed from Colombo, CMB) — not distance-banded. Two parallel zone tables: one for UL own-metal (`UL_FROM_CMB`), one for partner/oneworld awards (`PTR_FROM_CMB`).
- **Distance bands / zones:** 10 zones defined in `UL_ZONE`, keyed by country code, centred on Colombo (CMB):
  - Zone 1: Sri Lanka (`LK`)
  - Zone 2: South Asian Sub-Continent 1 (India, default)
  - Zone 3: South Asian Sub-Continent 2 (Pakistan; specific Indian airports)
  - Zone 4: Europe (`GB`, `DE`, `FR`, `IT`, `RU`)
  - Zone 5: Far East (`TH`, `SG`, `MY`, `HK`)
  - Zone 6: Japan (`JP`)
  - Zone 7: Middle East 1 (`AE`, `OM`, `QA`, `KW`)
  - Zone 8: Middle East 2 (`SA`)
  - Zone 9: Maldives (`MV`)
  - Zone 10: China (`CN`)

  For India (`IN`), zone resolution is airport-based via `getUlZone`: airports in `ZONE3_AIRPORTS_IN` (`BOM`, `DEL`) resolve to Zone 3; all other Indian airports default to Zone 2. Two additional sets, `ZONE3_AIRPORTS` (`BOM`,`DEL`,`CCU`,`MAA`) and `ZONE2_AIRPORTS` (`MAA`,`COK`,`BLR`,`TRZ`,`TRV`), are also declared in the file but are not referenced by `getUlZone` or anywhere else in `handle()`.
- **Own vs partner:** `resolveChart(legs, UL_CARRIERS)` (shared helper) classifies the itinerary as `"own"`, `"partner"`, or `"both"` based on whether all/none/some of the specified-carrier legs are UL. If the classification is not `"partner"`, the UL own-metal table is consulted; if not `"own"`, the partner table is consulted — so both entries can be emitted for mixed itineraries.
- **Seasons:** None — both tables use a single `"default"` season.
- **Cabins:** Economy and business are populated with values in `UL_FROM_CMB` and `PTR_FROM_CMB`; every row in both tables has `null` for premium economy and `null` for first, so those two cabins are always `null` for this programme in the current data.
- **Chart selection:** The itinerary must have one endpoint in Sri Lanka (`LK`) — checked against `legs[0].origin_cc` / the last leg's `destination_cc` — otherwise `handle()` returns `[]`. The foreign-side country/airport is zone-resolved via `getUlZone`; if no zone resolves, `[]` is returned. The resolved zone then indexes into `UL_FROM_CMB` and/or `PTR_FROM_CMB` depending on the own/partner/both classification.

## Output entries
`handle()` can return up to two entries per call:
- `{ programme: "flysmiles", chart: "ul_operated", season: "default", ... }` — from `UL_FROM_CMB[zone]`, emitted when chart classification is not `"partner"`.
- `{ programme: "flysmiles", chart: "partner", season: "default", ... }` — from `PTR_FROM_CMB[zone]`, emitted when chart classification is not `"own"`.

All cabin values are wrapped as fixed `[v, v]` pairs (single-value, not a true min/max range) via a local `wrap` function; rows/cells that are `null` in the source tables stay `null`. The `programme` field in every entry is the literal string `"flysmiles"`, matching the module's `slug` export.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

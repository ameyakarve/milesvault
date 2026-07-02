# Copa Airlines — ConnectMiles

- **Engine module id:** `connectmiles`
- **KG slug (`slug` export):** `connectmiles`
- **Airline / IATA:** Copa Airlines (CM)
- **Alliance:** Star Alliance
- **File header note:**
  ```
  ConnectMiles (Copa Airlines) — Zone-based charts

  Copa own-metal: zone-based with Saver and Standard tiers
  Partner (Star Alliance): fixed route-based chart, round-trip (60% for one-way)

  Source: vault Award Charts/ConnectMiles.md
  HOW TO REFRESH: Update zone maps and charts below
  ```
- **File size:** 243 lines

## Bookable carriers
Count: 30. `A3, AC, AD, AI, AV, BR, CA, CM, EK, ET, G3, KL, LH, LO, LX, MS, NH, NZ, OS, OU, OZ, SA, SN, SQ, TG, TK, TP, UA, VL, ZH`
Own-metal carriers used for chart selection: `CM` (`CM_CARRIERS` set)

## Pricing model
- **Structure:** Hybrid — zone-pair lookup tables for Copa own-metal (two tiers: Saver and Standard), plus a separate fixed zone-pair round-trip chart for Star Alliance partner flights (one-way priced as 60% of the round-trip value, rounded).
- **Distance bands / zones:** No distance bands; two independent zone maps keyed by country code (with a couple of airport-level overrides):
  - **Own-metal zones (`CM_ZONE`)**: `NAM1` (US, CA), `NAM2` (Toronto airports YYZ/YTZ, overriding CA), `MEX` (MX), `PAN` (PA), `CAM` (CR, SV, GT, HN, NI), `CB1` (BS, BB, BM, CU, CW, DO, HT, JM, PR, TT), `CB2` (GY, SR), `NSA` (CO, EC, PE, VE), `SSA` (AR, CL, PY, UY), `SAD` (BR).
  - **Partner zones (`PTR_ZONE`)**: `US_CA` (US, CA), `HI` (Hawaii airports HNL/OGG/KOA/LIH/ITO, overriding US), `SA` (IN, BD, LK, NP, PK, MV), `AU_NZ` (AU, NZ), `EU` (GB, FR, DE, NL, IT, ES, PT, CH, AT, SE, NO, DK, FI, IE, BE, GR, PL, CZ, HU, RO, TR, RU), `NA_ASIA` (JP, KR, CN, HK, TW), `ME` (AE, SA, QA, KW, BH, OM, IL, JO, EG).
- **Own vs partner:** `resolveChart(legs, CM_CARRIERS)` (shared helper) classifies the itinerary as `"own"`, `"partner"`, or `"both"` based on which flown carriers are in `CM_CARRIERS`. Own-metal zone lookups run whenever chart is not `"partner"`; the partner zone lookup runs whenever chart is not `"own"` — so a `"both"` result can emit entries from both tables.
- **Seasons:** None — every entry is emitted with `season: "default"`; no peak/off-peak distinction anywhere in the file.
- **Cabins:** Own-metal charts (`CM_ECO_S`, `CM_ECO_X`, `CM_BIZ_S`, `CM_BIZ_X`) price only economy and business; premium_economy and first are always `null`. The partner chart (`PTR`) prices economy, business, and first; premium_economy is always `null`.
- **Chart selection:** Origin/destination country codes (plus airport for the NAM2/Hawaii overrides) are mapped to zones via `getCmZone` / `getPtrZone`, then `pairKey(originZone, destZone)` is looked up in the relevant table(s). For own-metal, a zone pair may independently match Saver and/or Standard tables (checked with `!== undefined` on the raw lookup), producing up to two own-metal entries. For partner, a single `PTR` lookup returns a `[economy, business, first]` round-trip triple, converted to one-way values by `Math.round(v * 0.6)`.

## Output entries
`handle()` can return up to three entries, all hardcoded with `programme: "connectmiles"` (matching the slug):
- `chart: "own_saver"`, `season: "default"` — from `CM_ECO_S`/`CM_BIZ_S`, emitted only if an own-metal saver economy or business value exists for the zone pair.
- `chart: "own_standard"`, `season: "default"` — from `CM_ECO_X`/`CM_BIZ_X`, emitted only if an own-metal standard economy or business value exists for the zone pair.
- `chart: "partner"`, `season: "default"` — from `PTR`, emitted only if a partner zone-pair entry exists.

All cabin values in every entry are fixed `[v, v]` pairs (the raw scalar duplicated as both min and max) — none are built via the shared `makeEntry` helper, but each is constructed as a literal `[x, x]` array rather than a true `[min, max]` range. No entry in this module contains distinct min/max bounds.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

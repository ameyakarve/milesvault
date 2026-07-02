# Aeromexico — Club Premier

- **Engine module id:** `clubpremier`
- **KG slug (`slug` export):** `club-premier`
- **Airline / IATA:** Aeromexico (AM)
- **Alliance:** SkyTeam
- **File header note:**
  ```
  Club Premier / Aeromexico Rewards — Zone-based chart

  AM own-metal: zone-based from Mexico with Low and High season.
    Classic awards at fixed chart prices. Dynamic Fare awards also exist.
    Returns [low, high] ranges.

  SkyTeam partner: unpublished pricing, phone-only. Limited data points.

  Source: vault Award Charts/Club Premier.md
  HOW TO REFRESH: Update zone maps and charts below
  ```
- **File size:** 135 lines

## Bookable carriers
Count: 18. `AF, AM, AR, CI, DL, GA, KE, KL, KQ, ME, MF, MU, RO, SK, SV, UX, VN, VS`
Own-metal carriers used for chart selection: `AM`

## Pricing model
- **Structure:** Zone-pair chart — one-way pricing keyed by geographic zone, from a fixed table (`AM_FROM_MX`), not distance-band or per-segment additive.
- **Distance bands / zones:** No distance bands. Zone map (`ZONE`) assigns country codes to 15 zones: MX, NAM2 (Canada, plus US airports JFK/SEA/ORD), EU (incl. Russia/Turkey), NAF, MEA, NEA, SEA, SWA, AF, AUNZ, CAC, NSAM, SSAM, plus computed zones NAM1 and HI for other US airports (HI for HNL/OGG/KOA/LIH/ITO, NAM1 for all other US). Chart (`AM_FROM_MX`) has one row per zone (MX, NAM1, NAM2, CAC, NSAM, SSAM, HI, EU, NAF, MEA, NEA, SEA, SWA, AF, AUNZ), each row `[ecoLow, ecoHigh, bizLow, bizHigh]`.
- **Own vs partner:** `resolveChart(legs, AM_CARRIERS)` (AM_CARRIERS = {AM}) classifies the itinerary as "own", "partner", or "both" per the shared helper. If the result is not `"partner"`, the AM own-metal chart logic runs. If the result is `"partner"` (all specified carriers are non-AM SkyTeam), no entry is produced — the code comment states SkyTeam partner pricing is unpublished/phone-only and "cannot compute."
- **Seasons:** Header comment mentions "Low and High season," but the chart itself (`AM_FROM_MX`) has no season dimension and `handle()` always emits `season: "default"`. No peak/off-peak branching exists in the code.
- **Cabins:** Economy and business are priced (both as `[low, high]` ranges from the chart); premium_economy and first are always `null`.
- **Chart selection:** Only applies when either the origin or destination country code is `"MX"`. If both origin and destination are `MX`, uses `AM_FROM_MX["MX"]` (domestic). Otherwise, the non-MX side's country code and airport are looked up via `getZone(cc, airport)` to determine a zone, and that zone's row in `AM_FROM_MX` is used (only if the zone exists and has a chart entry). If neither origin nor destination is MX, no entry is added for the own-metal branch.

## Output entries
`handle()` returns at most one entry (zero for partner-only or non-MX itineraries with no matching zone). All entries use `programme: "clubpremier"`, `chart: "classic"`, `season: "default"`. Economy and business are built as literal `[low, high]` array pairs directly from the `AM_FROM_MX` chart rows (true `[min, max]` ranges, not built via `makeEntry`/not fixed `[v,v]`); premium_economy and first are `null`. The `programme` field value `"clubpremier"` differs from the `slug` export value `"club-premier"`.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

# American Airlines — AAdvantage

- **Engine module id:** `aadvantage`
- **KG slug (`slug` export):** `aadvantage`
- **Airline / IATA:** American Airlines (AA)
- **Alliance:** oneworld
- **File header note:**
  ```
  AAdvantage (American Airlines)

  - AA own-metal: dynamic (return published floors as [min, min])
  - Partner awards: fixed zone-based chart, origin-dependent
  - "Business/First" is a single column for most routes; separate First where noted

  Source: https://www.aa.com/i18n/aadvantage-program/miles/redeem/award-travel/oneworld-and-other-airline-background.jsp
  Verified against aa.com interactive chart Mar 2026; IS origin corrections: ME PE 22.5K→20K, A2 E 22.5K→25K, SP PE 57K→57.5K
  HOW TO REFRESH: Update the CHARTS object and AA_FLOORS below with new pricing
  ```
- **File size:** 255 lines

## Bookable carriers
Count: 19. `AA, AS, AT, AY, BA, CX, EI, EY, FJ, G3, IB, JL, MH, QF, QR, RJ, TN, UL, WY`
Own-metal carriers used for chart selection: `AA` (the `AA_CARRIERS` set)

## Pricing model
- **Structure:** zone-pair chart. Own-metal is a dynamic-floor table keyed by a single zone (destination or origin zone); partner awards use an origin-dependent zone × zone chart (`CHARTS[originZone][destZone]`, with a reverse-direction fallback `CHARTS[destZone][originZone]` when the forward pair is absent).
- **Distance bands / zones:** No distance bands. Zones are assigned per country code: `US` (US+Canada), `MX`, `CB` (Caribbean), `CA_AM` (Central America), `SA1`, `SA2`, `EU`, `ME`, `IS` (Indian Subcontinent, incl. Central Asian -stan countries), `AF`, `A1` (Japan/Korea), `A2` (China/SE Asia), `SP` (South Pacific). US is further split into `US`/`HI`/`AK` via `HI_AIRPORTS` and `AK_AIRPORTS` airport sets.
- **Own vs partner:** `carriers` = the set of leg carrier codes present. If there are no specified carriers, or all specified carriers are in `AA_CARRIERS`, the own-metal floor path is used and the function returns immediately (no partner chart is appended in this case). Otherwise the partner `CHARTS` table is consulted by origin zone, then by destination zone as a fallback.
- **Seasons:** none — every entry uses `season: "default"`.
- **Cabins:** economy, premium_economy, business, first are all represented in the data, though premium_economy and first are `0` (rendered as `null`) on many zone-pair rows.
- **Chart selection:** `originZone` = `getZone` of the first leg's origin country/airport; `destZone` = `getZone` of the last leg's destination country/airport. Own-metal floor is looked up in `AA_FLOORS[destZone]` (falling back to `AA_FLOORS[originZone]`). Partner chart is looked up as `CHARTS[originZone][destZone]`, then `CHARTS[destZone][originZone]` if the forward pair doesn't exist.

## Output entries
Own-metal path: one entry, `chart: "own_floor"`, `season: "default"`, built from `AA_FLOORS` as fixed `[v,v]` pairs (economy, premium_economy if nonzero, business; first is always `null` on this path).
Partner path: one entry, `chart: "partner"`, `season: "default"`, built from a `CHARTS` row as fixed `[v,v]` pairs for economy, premium_economy (null if the row value is 0), business, and first (null if the row value is 0).
All entries use fixed `[v,v]` values, never true `[min,max]` ranges. The `programme` field is set to `"aadvantage"`, matching the `slug` export.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

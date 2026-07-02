# China Eastern Airlines — Eastern Miles

- **Engine module id:** `easternmiles`
- **KG slug (`slug` export):** `eastern-miles`
- **Airline / IATA:** China Eastern Airlines (own carriers: `MU` = China Eastern, `FM` = Shanghai Airlines)
- **Alliance:** SkyTeam (per file comment: "SkyTeam members minus OK (Czech Airlines ceased operations), plus non-alliance partners: JL, CX, QF")
- **File header note:**
  ```
  Eastern Miles (China Eastern Airlines) — Hybrid pricing

  Domestic: distance-based (km)
  International: region-based from China
  Non-alliance partners: separate charts (JAL, CX, QF)

  Note: Eastern Miles uses km for distance bands, not miles.
  The haversine function returns statute miles, so we convert.

  Source: vault Award Charts/Eastern Miles.md
  HOW TO REFRESH: Update zone maps and charts below
  ```
- **File size:** 177 lines

## Bookable carriers
Count: 19. `AF, AM, AR, CI, DL, GA, KE, KL, KQ, ME, MF, MU, QF, RO, SK, SV, UX, VN, VS`
Own-metal carriers used for chart selection: `MU, FM` (`MU_CARRIERS` set, passed to `resolveChart`)

## Pricing model
- **Structure:** Hybrid — (1) domestic China distance-band whole-journey chart, (2) international region-pair chart for China-origin/destination itineraries on own metal, and (3) three separate fixed round-trip partner charts (JAL, CX, QF) keyed on zone-pair plus a specific operating carrier.
- **Distance bands / zones:**
  - Domestic bands (km, whole-journey distance converted from `totalDistance` miles via `distKm = totalDistance * 1.60934`): `[600, 1200, 1800, 2400, Infinity]`.
  - International zone map (`ZONE`, keyed by country code, plus a `HI_AIRPORTS` override set of `HNL, OGG, KOA, LIH, ITO` mapped to a distinct `HI` zone even though country code is `US`): zones are `CN, HKMT, NEA, SEA, SACA, EU, NAM, MXCAC, NSAM, SSAM, SPAC, MENA, CSAF, HI`, each mapped from lists of ISO country codes (e.g. `HKMT` = HK/MO/TW; `NEA` = JP/KR; `SEA` = TH/SG/MY/ID/PH/VN/KH/MM/LA; `NAM` = US/CA; `SPAC` = AU/NZ/FJ; etc., per the `ZONE` object).
- **Own vs partner:** `resolveChart(legs, MU_CARRIERS)` returns `"own"`, `"partner"`, or `"both"` based on whether all/any/none of the itinerary's specified-carrier legs are in `MU_CARRIERS`. Domestic and own-international pricing only run when `chart !== "partner"`; the three non-alliance partner charts only run when `chart !== "own"` (so a `"both"` itinerary can produce entries from multiple branches).
- **Seasons:** All entries use `season: "default"`. No peak/off-peak distinction exists anywhere in the file.
- **Cabins:** Domestic and own-international charts price economy, business, and first (premium_economy always `null`). International `EU`, `SPAC`, and `HI` zone rows have business and first hardcoded to `null` ("Only economy published" / "grouped" per inline comments). Partner charts: JAL and QF price economy/business/first; CX prices economy/business only (first is `null`, `const [e, b] = PARTNER_CX_HK_SPAC` destructures only two of three array elements).
- **Chart selection:**
  - Domestic: triggered when `originCC === "CN" && destCC === "CN"` and `chart !== "partner"`; band index chosen by first band boundary `>=` converted distance in km; falls back to `idx = 0` if no band matched in the loop (loop uses local `break`, not the shared `resolveBand` helper).
  - Own international: triggered when `chart !== "partner"` and either origin or destination country code is `CN`; the non-China side's country/airport resolves to a zone via `getZone`, and that zone's row in `INTL` is used (only runs if `zone && INTL[zone]` — an unmapped country produces no own-international entry).
  - Partner charts: triggered when `chart !== "own"`; zone is computed for both origin and destination via `getZone` (not restricted to China endpoints); each of the three partner branches checks for a specific zone-pair (order-independent, either direction) AND requires the corresponding carrier (`JL`, `CX`, or `QF`) to be present in the leg carriers, or requires the carriers array to be empty (`carriers.length === 0`) meaning no carrier was specified.

## Output entries
`handle()` can return: one `domestic` entry (China-domestic distance band, values wrapped as fixed `[v,v]`, e.g. `economy: [e, e]`), one `own_international` entry (chart `own_international`, values wrapped fixed `[v,v]` via a local `wrap` helper, with `null` retained for unpublished cabins), and/or up to three partner entries (`partner_jal`, `partner_cx`, `partner_qf`), each built by halving the round-trip constant (`e / 2`, `b / 2`, `f / 2`) and wrapping as fixed `[v,v]`. Every entry across all branches is a fixed-value range (min equals max); none of the entries are built as a true `[min, max]` range. Every entry hardcodes `programme: "easternmiles"`, which matches the module id but differs in spelling/format from the KG slug `eastern-miles`.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

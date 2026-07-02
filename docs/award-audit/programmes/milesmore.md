# Lufthansa Group — Miles & More

- **Engine module id:** `milesmore`
- **KG slug (`slug` export):** `miles-and-more`
- **Airline / IATA:** Lufthansa (LH), Group also covers Swiss (LX), Austrian (OS), and Discover Airlines (VL)
- **Alliance:** Star Alliance
- **File header note:**
  ```
  Miles & More (Lufthansa Group)

  - LH/LX/OS/VL own-metal: dynamic pricing (return [0,0])
  - Partner (Star Alliance + Brussels/Discover): fixed zone-based chart, round-trip halved

  Source: vault Award Charts/Miles & More/Miles & More Partner Chart.md
  HOW TO REFRESH: Update CHARTS below from miles-and-more.com
  ```
- **File size:** 156 lines

## Bookable carriers
Count: 33. `4Y, A3, AC, AI, AV, AZ, BR, CA, CM, CX, EN, ET, EW, LA, LH, LO, LX, MS, NH, NZ, OA, OS, OU, OZ, SA, SN, SQ, TG, TK, TP, UA, VL, ZH`
Own-metal carriers used for chart selection: `LH, LX, OS, VL` (`LH_GROUP`).

## Pricing model
- **Structure:** hybrid — LH Group own-metal is a fixed placeholder (`[0,0]`, dynamic pricing not modeled); the partner chart is a zone-pair matrix storing round-trip prices that are halved for a one-way quote.
- **Distance bands / zones:** no distance bands. `ZONE` maps country codes to 10 zone codes: `EU, NAM, CAM, SAM, ME, SAF, IN, SEA, FE, OC`, plus a special `HI` (Hawaii) zone assigned via a fixed set of Hawaiian airport codes (`HNL, OGG, KOA, LIH, ITO, MKK`) checked against `origin`/`destination` airport when the country is `US` — 11 zone codes in total. The `CHARTS` matrix (`C`, built via `pairKey`) covers a large but not exhaustive set of zone-pair combinations.
- **Own vs partner:** if every leg's carrier is in `LH_GROUP`, a single dynamic entry (`[0,0]`/`[0,0]`) is returned immediately. Otherwise, the module looks up the origin/destination zone pair in the partner `CHARTS` table; if either zone is unresolved or no chart row exists, it returns `[]`.
- **Seasons:** none — the single label used is `"default"`.
- **Cabins:** partner chart provides economy, business, and first (`[e, b, f]`); premium_economy is always `null`. The own-metal (LH Group) entry sets economy and business to `[0,0]` and premium_economy/first to `null`.
- **Chart selection:** zone of origin/destination determined by `getZone(cc, airport)` (country lookup, with the Hawaii airport override); zone pair looked up via `pairKey` in `CHARTS`.

## Output entries
`handle()` returns at most one entry. For LH Group own-metal itineraries: chart `"dynamic"`, season `"default"`, economy `[0,0]`, business `[0,0]`, premium_economy/first `null`. For partner itineraries with a matched zone pair: chart `"partner"`, season `"default"`, with each cabin value computed as `[v/2, v/2]` from the round-trip chart figure — a fixed halved value, not a true `[min, max]` range.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

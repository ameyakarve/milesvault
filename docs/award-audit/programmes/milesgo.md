# TAP Air Portugal — Miles&Go

- **Engine module id:** `milesgo`
- **KG slug (`slug` export):** `miles-and-go`
- **Airline / IATA:** TAP Air Portugal (TP)
- **Alliance:** Star Alliance
- **File header note:**
  ```
  Miles&Go (TAP Air Portugal) — Zone-based charts

  TAP own-metal: partially dynamic — return [0,0] for own-metal
  Partner (Star Alliance): zone-based with limited published data

  Source: vault Award Charts/Miles&Go.md
  HOW TO REFRESH: Update zone maps and charts below when full chart is published
  ```
- **File size:** 146 lines

## Bookable carriers
Count: 30. `A3, AC, AD, AI, AV, BR, CA, CM, EK, ET, EY, G3, LH, LO, LX, MS, NH, NZ, OS, OU, OZ, SA, SN, SQ, TG, TK, TP, UA, VL, ZH`
Own-metal carriers used for chart selection: `TP` (`TP_CARRIERS` set, used only as the argument to `resolveChart`).

## Pricing model
- **Structure:** hybrid — TAP own-metal is a fixed placeholder (`[0,0]`, i.e. dynamic pricing not modeled), and the Star Alliance partner side is a zone-pair chart (one row per unordered zone pair via `pairKey`).
- **Distance bands / zones:** no distance bands. The `ZONE` map assigns each country code to one of 10 distinct zone codes: `PT, SNA, EU, WAF, AAF, ME, NAM, CAM, SAM, ASOC` (the file header/inline comment describes this as an "11-zone mapping," but only 10 distinct zone values actually appear in the `ZONE` object). The partner chart (`PTR`) is populated for a subset of zone pairs only — not all zone-pair combinations have entries.
- **Own vs partner:** `resolveChart(legs, TP_CARRIERS)` returns `"own"`, `"partner"`, or `"both"` based on whether specified-carrier legs are all/none/some in `{TP}`. If the result is not `"partner"`, an `own_dynamic` entry is emitted; if not `"own"`, the code looks up the origin/destination zone pair in `PTR` and emits a `partner` entry if a row exists.
- **Seasons:** none — every entry uses the literal string `"default"`.
- **Cabins:** economy, business, and first are priced from the `PTR` table entries (`[e, biz, f]`); premium_economy is always `null`. The own-metal entry sets economy and business to `0` and premium_economy/first to `null`.
- **Chart selection:** origin/destination country codes (`origin_cc`/`destination_cc` of the first/last leg) are mapped through `ZONE`; if either side has no zone mapping, no partner entry is produced. The resulting zone pair is looked up via `pairKey` in the `PTR` object built by the `pt(a, b, e, biz, f)` helper.

## Output entries
`handle()` can return up to two entries: an `own_dynamic` entry (chart `"own_dynamic"`, season `"default"`, economy `[0,0]`, business `[0,0]`, premium_economy/first `null`) when the itinerary is not purely partner-operated, and a `partner` entry (chart `"partner"`, season `"default"`) when the zone pair has a published row. All non-null cabin values are constructed via `wrap(v) => [v, v]` from a single source number — they are fixed values, not true `[min, max]` ranges.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

# Air Canada — Aeroplan

- **Engine module id:** `aeroplan`
- **KG slug (`slug` export):** `aeroplan`
- **Airline / IATA:** Air Canada (AC)
- **Alliance:** Star Alliance
- **File header note:** none (no Source/HOW TO REFRESH docblock at the top of the file). A comment sits directly above the `CHARTS` table: "Effective 2026-06-01 (Aeroplan partner award chart revaluation). Bands/zones unchanged from the prior chart; only point values moved. NA|NA, SA|SA, NA|SA, AT|SA, PA|SA were unaffected by the revaluation."
- **File size:** 147 lines

## Bookable carriers
Count: 45. `A3, AC, AD, AI, AV, AZ, BR, BT, CA, CM, CX, EK, EN, ET, EW, EY, FZ, G3, GF, HO, JU, LH, LO, LX, MK, MS, NH, NZ, OA, OS, OU, OZ, SA, SN, SQ, TG, TK, TP, UA, VA, VL, WY, XQ, ZH, 4Y`
Own-metal carriers used for chart selection: n/a. There is no `ownCarriers`/`resolveChart` split in this module. Instead, every carrier in the itinerary is classified as either a "dynamic partner" (`DYNAMIC_PARTNERS = {AC, UA, EK, EY, FZ}` — this set includes Air Canada itself) or a "fixed-chart partner" (every other bookable carrier).

## Pricing model
- **Structure:** hybrid — a zone-pair chart where each zone pair also has its own internal distance-band table (band boundaries differ per zone pair). Separately, a fixed subset of carriers (including AC) is routed to a flat placeholder instead of any chart.
- **Distance bands / zones:** Countries map to one of 4 zones via `ZONE`: `NA` (North/Central America incl. Caribbean), `SA` (South America), `AT` ("Atlantic" — Europe, Middle East, Africa, Indian Subcontinent, Central Asia), `PA` ("Pacific" — East/Southeast Asia, Oceania). Each `CHARTS[pairKey(zone1,zone2)]` entry is an array of `[maxDistance, economy, business, first]` bands, e.g. `NA|NA`: `[500, 6000, 15000, null]`, `[1500, 10000, 20000, null]`, `[2750, 12500, 25000, null]`, `[Infinity, 22500, 35000, null]`; `AT|PA`: `[2500, 25000, 47500, 55000]` … `[Infinity, 75000, 130000, 150000]`. 10 zone pairs are defined in total (`NA|NA`, `AT|NA`, `NA|PA`, `NA|SA`, `AT|AT`, `PA|PA`, `AT|PA`, `SA|SA`, `AT|SA`, `PA|SA`), each with 3–5 bands.
- **Own vs partner:** Carriers are scanned once and classified as dynamic (`DYNAMIC_PARTNERS`) or fixed. If the itinerary is all-dynamic, a placeholder "dynamic" entry is returned. If it mixes dynamic and fixed carriers, an empty array is returned (unsupported combination). If it is all-fixed (or has no specified carriers), the zone-pair/distance-band chart is used. There is no separate "Air Canada own-metal chart" — AC is grouped with the dynamic-pricing carriers.
- **Seasons:** none — every entry uses `season: "default"`.
- **Cabins:** economy, business, first are priced from the chart (first is `null` on the `NA|NA` zone pair only). premium_economy is always `null` on both the dynamic and fixed-chart output paths.
- **Chart selection:** `originZone` = `ZONE[firstLeg.origin_cc]`, `destZone` = `ZONE[lastLeg.destination_cc]`. Chart is `CHARTS[pairKey(originZone, destZone)]` (zone pair is direction-agnostic). Within that chart, the row is the first band whose `maxDistance` is `>= totalDistance`.

## Output entries
- All-dynamic itinerary (only AC/UA/EK/EY/FZ present): one entry, `chart: "dynamic"`, `season: "default"`, `economy: [0,0]`, `business: [0,0]`, `premium_economy: null`, `first: null` — a placeholder rather than real pricing (note: `makeEntry`'s wrap treats `0` as a real value, not as "no data", so this renders as `[0,0]` rather than `null`).
- Mixed dynamic + fixed carriers: returns `[]`.
- Fixed-chart itinerary: one entry, `chart: "partner"`, `season: "default"`, economy/business/first from the resolved band row, `premium_economy: null`.
- All values are fixed `[v,v]` pairs (via `makeEntry`), never true ranges. The `programme` field is `"aeroplan"`, matching the `slug` export.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

# All Nippon Airways — ANA Mileage Club

- **Engine module id:** `ana`
- **KG slug (`slug` export):** `ana-mileage-club`
- **Airline / IATA:** All Nippon Airways (NH)
- **Alliance:** Star Alliance
- **File header note:** none (no Source/HOW TO REFRESH docblock at the top of the file).
- **File size:** 277 lines

## Bookable carriers
Count: 36. `A3, AC, AI, AV, BR, CA, CM, EN, ET, EW, EY, HO, LH, LO, LX, MS, NH, NX, NZ, OA, OS, OU, OZ, PR, SA, SN, SQ, TG, TK, TP, UA, VA, VL, VN, VS, ZH`
Own-metal carriers used for chart selection: `NH` (the `ANA_CARRIERS` set)

## Pricing model
- **Structure:** zone-pair chart with two independent tables — a seasonal own-metal table (`ANA_OWN`) and a single-season partner table (`ANA_PTR`). Both store round-trip mileage values that are halved for one-way pricing.
- **Distance bands / zones:** `ANA_ZONE` assigns countries to 9 region zones: Japan, South Korea, Asia 1, Asia 2, North America, Europe, Middle East / Africa, Central / South America, Oceania; a separate Hawaii zone is detected via `HAWAII_AIRPORTS` overriding the US country mapping. The partner table further splits Japan into `Japan 1-A` / `Japan 1-B`, but code only ever normalizes the generic Japan zone to `Japan 1-A`.
- **Own vs partner:** `resolveChart(legs, ANA_CARRIERS)` yields `own`/`partner`/`both`.
  - Own-metal (when result ≠ `"partner"`): any zone starting with "Japan" is normalized to plain `Japan`. The own-metal chart explicitly excludes itineraries where either end is `Middle East / Africa` or `Central / South America` (no lookup is attempted in that case). Lookup is `ANA_OWN[pairKey(ownFrom, ownTo)]`, a per-pair dict of three seasons (L/R/H), each halved for one-way.
  - Partner (when result ≠ `"own"`): plain `Japan` is normalized to `Japan 1-A`. Lookup is `ANA_PTR[pairKey(pFrom, pTo)]` (single season), halved for one-way.
- **Seasons:** own-metal has three — "low" (L), "regular" (R), "high" (H) — all emitted as separate entries whenever a pair is found. Partner has none (`season: "default"`).
- **Cabins:** own-metal prices economy, premium_economy, business, first (first is frequently `null` on shorter regional pairs). Partner prices economy, business, first only (premium_economy always `null`).
- **Chart selection:** `getZone(cc, airport)` on the first leg's origin and the last leg's destination; own-metal lookup uses Japan-normalized zone names, partner lookup uses the Japan→`Japan 1-A` substitution.

## Output entries
Up to 4 entries per itinerary: up to 3 own-metal season entries (`chart: "own"`, seasons low/regular/high) plus 1 partner entry (`chart: "partner"`, `season: "default"`), combined when `resolveChart` returns `"both"`. All cabin figures are one-way (halved from the stored round-trip figures) and are fixed `[v,v]` pairs, never true ranges. The `programme` field is hardcoded to `"ana"`, which differs from the `slug` export `"ana-mileage-club"`.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

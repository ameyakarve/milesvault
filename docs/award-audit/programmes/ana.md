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

## Award chart verification notes (July 2026)

Verified against ANA's live published pages (real-Chrome pull, 2026-07-02):
`/en/jp/guide/amc/award/international/terms/` (own-metal, "Revised" chart
effective for tickets issued on/after 2025-06-24) and
`/en/us/amc/partner-flight-awards/` (partner chart, Apr-2024 "after revision"
values; page states it is valid for tickets issued on/after 2025-06-24).

- **Own-metal (`ANA_OWN`): all 19 existing zone pairs match the published
  revised round-trip chart cell-for-cell** (every cabin, every L/R/H season).
  One-way tables on the page equal revised-RT/2 everywhere, so the module's
  halving is exact, not approximate.
- **FIXED — 6 zone pairs were missing** and returned no own-metal price:
  Asia1–Hawaii, Asia1–North America, Asia1–Europe, Asia1–Oceania (values equal
  the South Korea rows cell-for-cell on the published chart), Asia2–Hawaii,
  Hawaii–Oceania. Added from the published revised chart; spot-checked
  HKG→HNL on NH prices L/R/H one-way Y 20,000/25,000/40,500 as published.
- **Partner (`ANA_PTR`): all ~90 published zone pairs match exactly**,
  including intra–Middle East/Africa and intra–Central/South America
  (35,000/60,000/90,000 RT after-revision) and the Japan 1-A vs 1-B split.
  Japan 1-A–Zone 8 and 1-A–Zone 9 are published N/A and correctly absent.
- **Japan 1-A vs 1-B is NOT geographic** — the page defines 1-A as itineraries
  containing only an international round trip (plus domestic JP connections);
  1-B is everything else (complex multi-sector itineraries). The engine prices
  simple itineraries, so its unconditional Japan→1-A normalization is correct
  behaviour, not a bug. Documented here to stop future sessions "fixing" it.
- **Known unmodelled edge:** ANA splits Russia into Russia 1 (Primorsky→Zone 2),
  Russia 2 (European→Zone 7), Russia 3 (Siberia→Zone 4); the module maps all
  RU→Europe. No NH service to Russia currently — left as documented gap.
- The stale `mileage_chart_en_int.pdf` on ana.co.jp still carries the
  pre-2025-06-24 chart; do not use it as a source.

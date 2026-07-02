# SAS (Scandinavian Airlines) — EuroBonus

- **Engine module id:** `eurobonus`
- **KG slug (`slug` export):** `eurobonus`
- **Airline / IATA:** SAS — Scandinavian Airlines (SK)
- **Alliance:** SkyTeam — stated directly in the file header ("EuroBonus (SAS/SkyTeam)"); the `BOOKABLE` set is SkyTeam member carriers (AF, AM, AR, CI, DL, GA, KE, KL, KQ, ME, MF, MU, RO, SK, SV, UX, VN, VS).
- **File header note:**
  ```
  EuroBonus (SAS/SkyTeam) — Zone-based charts

  SK own-metal: zone-based from Scandinavia, one-way (60% of RT)
  SkyTeam partner: zone-based, round-trip chart. One-way = 60% of RT.

  Source: vault Award Charts/EuroBonus.md
  HOW TO REFRESH: Update zone maps and charts below
  ```
- **File size:** 269 lines

## Bookable carriers
Count: 18. `AF, AM, AR, CI, DL, GA, KE, KL, KQ, ME, MF, MU, RO, SK, SV, UX, VN, VS`
Own-metal carriers used for chart selection: `SK` (`SK_CARRIERS` set, single member).

## Pricing model
- **Structure:** zone-pair, hybrid — two independent zone systems, one for SAS own-metal and one for the SkyTeam partner chart, each with its own zone map and its own rate table.
- **Distance bands / zones:**
  - Own-metal (`SK_ZONE`, keyed by country code, 4 zones): `DOM_SCAN` (Denmark, Norway, Sweden), `NORDIC` (Finland, Estonia, Latvia, Lithuania, Germany, Poland), `EUROPE` (remaining European/nearby countries), `INTERCON` (US, Canada, Mexico, Japan, China, Korea, Thailand, India, Hong Kong, Singapore).
  - Partner (`PTR_ZONE`, keyed by country code, 11 broader zones): `EU`, `NAM`, `CAC` (Central America & Caribbean), `SAM`, `NCAME` (N./Central Africa & Middle East), `SAF` (Southern Africa), `CESA` (Central/East/South Asia), `SEA`, `PAC`. A Hawaii-airport override (`HNL, OGG, KOA, LIH, ITO`) reclassifies US Hawaii routes from `NAM` to `PAC`.
- **Own vs partner:** `resolveChart(legs, SK_CARRIERS)` classifies the itinerary as `"own"`, `"partner"`, or `"both"`; own-metal pricing is attempted when `chart !== "partner"`, partner pricing when `chart !== "own"`.
  - Own-metal requires the origin or destination country to be in Scandinavia (`DK/NO/SE`); the zone of the non-Scandinavian end is looked up in `SK_ZONE` (both ends Scandinavian and identical → `DOM_SCAN`).
  - Partner requires both origin and destination zones to resolve via `getPtrZone`; a same-country, same-zone (`EU`) pair restricted to `DK, NO, SE, FR, ES, IT` is special-cased to a separate "Domestic Europe" round-trip rate (`PTR_DOM_EU`) rather than the general `EU-EU` rate.
- **Seasons:** none — all entries use season `"default"`.
- **Cabins:** own-metal chart (`SK_CHART`) rows are `[economy, premEcon, business]`; `DOM_SCAN` has `business: null`, all others have all three priced; first is always `null`. Partner chart (`PTR`) rows are `[economy, premEcon, business, first]` — all four cabins priced when the zone pair exists in the table.
- **Chart selection:** own-metal: `SK_CHART[zone]`, zone determined above. Partner: `PTR[pairKey(oz, dz)]` (or `PTR_DOM_EU` for the domestic-Europe special case); partner values are stored round-trip and multiplied by `0.6` to derive one-way. A 2× multiplier is applied to the partner rate before the 0.6 factor when any leg is operated by Air Europa (`UX`), China Airlines (`CI`), or Vietnam Airlines (`VN`) — the `DOUBLE_POINTS` set.

## Output entries
`handle()` can return 0–2 entries: chart `sk_operated` (own-metal) and chart `partner` (SkyTeam), both season `"default"`, both built as literal objects (not via `makeEntry`). All values are fixed `[v, v]` pairs, not true ranges. The `programme` field is hardcoded as `"eurobonus"` on both entries, matching both the module id and the `slug` export.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

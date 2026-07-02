# Saudia — Alfursan

- **Engine module id:** `alfursan`
- **KG slug (`slug` export):** `alfursan`
- **Airline / IATA:** Saudia (SV)
- **Alliance:** SkyTeam
- **File header note:**
  ```
  Alfursan (Saudia) — Zone-based charts

  SV own-metal: zone-based from Saudi Arabia, Reward and Reward+ tiers.
    Reward+ = exactly 2x Reward. First only at Reward rates.
    Returns [Reward, Reward+] for economy/business, [Reward, Reward] for first.

  SkyTeam partner: 17-zone matrix (round-trip, halved for one-way).
    Only sample partner pricing available — limited zone pairs.

  Source: vault Award Charts/Alfursan.md
  HOW TO REFRESH: Update zone maps and charts below
  ```
- **File size:** 209 lines

## Bookable carriers
Count: 21. `AF, AM, AR, AZ, CI, CZ, DL, EY, GA, KE, KL, KQ, ME, MF, MU, RO, SK, SV, UX, VN, VS`
Own-metal carriers used for chart selection: `SV` (the `SV_CARRIERS` set)

## Pricing model
- **Structure:** zone-pair chart, using two independent zone systems — a 13-zone own-metal system anchored on Saudi Arabia, and a separate 17-zone SkyTeam partner system.
- **Distance bands / zones:** Own-metal zones (`OWN_ZONE`, 13 total): `DOM`, `GCC`, `ME`, `AFE`, `AFN`, `AFS`, `EUA`, `EUB`, `SCA`, `SCB`, `FE`, `NAMA`, `NAMB`. India splits into `SCA` (north, via `NORTH_INDIA_AIRPORTS`) / `SCB` (south); the US splits into `NAMB` (LAX only) / `NAMA` (rest). Partner zones (`PTR_ZONE`, numbered 1–17, with zone 16 = Hawaii and zone 14 = Alaska/LAX/Caribbean/Mexico/Central America handled only via `getPtrZone`'s airport logic, not present as country entries in the base map).
- **Own vs partner:** `resolveChart(legs, SV_CARRIERS)` yields `own`/`partner`/`both`. The own-metal branch runs when the result isn't `"partner"` and either the origin or destination country is Saudi Arabia (or both, for domestic SA-SA); the partner branch runs when the result isn't `"own"`, using the 17-zone `PTR` table keyed by `pairKey` of the two numeric zone ids.
- **Seasons:** none. Instead of seasons, own-metal produces two chart tiers per lookup: `own_reward` and `own_reward_plus` (Reward+ = exactly 2× Reward for economy/business; no First on Reward+).
- **Cabins:** own-metal prices economy, business, first (premium_economy always `null`). Partner prices economy, business, first (premium_economy always `null`).
- **Chart selection:** Own-metal zone = `getOwnZone(foreignCC, foreignAirport)` for whichever end of the itinerary isn't Saudi Arabia. Partner zones = `getPtrZone(cc, airport)` applied to both origin and destination, then looked up via `pairKey(String(oz), String(dz))` in a hand-populated `PTR` map.

## Output entries
- `own_reward` (season `default`): `economy: [e,e]`, `business: [b,b]`, `first: [f,f]`, `premium_economy: null` — taken directly from `SV_OWN[zone]`.
- `own_reward_plus` (season `default`): `economy: [2e,2e]`, `business: [2b,2b]`, `first: null`, `premium_economy: null`.
- `partner` (season `default`): economy/business/first each equal to half of a hardcoded round-trip sample value in `PTR` (one-way = RT/2), `premium_economy: null`. Only 5 zone pairs are populated in `PTR` (1|1, 1|2, 13|8, 13|15, 16|17); any other zone-pair combination yields no partner entry.
All values are fixed `[v,v]` pairs, never true ranges. The `programme` field is `"alfursan"`, matching the `slug` export.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

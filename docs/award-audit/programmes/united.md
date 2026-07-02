# United Airlines — MileagePlus

- **Engine module id:** `united`
- **KG slug (`slug` export):** `united-mileageplus`
- **Airline / IATA:** United Airlines (UA)
- **Alliance:** Star Alliance
- **File header note:**
  ```
  United MileagePlus — Dynamic pricing with observed saver floors

  Returns [own_floor, partner_floor] as min/max range per zone pair.
  Own-metal floors are ~10% lower than partner floors.

  Source: vault Award Charts/United MileagePlus.md, Upgraded Points (Jan 2026)
  HOW TO REFRESH: Update FLOORS below with new observed minimums

  TODO: FLOORS_NONUS is stale and disagrees with Seats.aero full-year data (Mar 2026).
  Reverse-engineer proper non-US zone pairs from Seats.aero sources=united queries.
  Known discrepancies (code value → Seats.aero actual, full year, flat pricing):
    CSA|EU:  33K/60.5K  → 55K/110K/165K  (all EU destinations from DEL)
    AF|CSA:  45K/88K    → 55K/110K/165K  (NBO, CAI from DEL)
    CSA|ME:  30K/55K    → 40K/75K        (DXB from DEL)
    CSA|SEA: 22.5K/45K  → varies: BKK/HKG 22.5K/65K, SIN-DEL 35K/90K, SIN-BOM 22.5K/65K
                           Business floor is 65K not 45K for most SEA; SIN from DEL is a separate tier
    First class missing  → 165K (EU/AF), 140K (OC), 110K (SIN-DEL), 75K (SIN-BOM, BKK-BOM)
  United likely uses distance bands within zones, not pure zone-pair pricing for non-US origins.
  Build a systematic Seats.aero scrape across all India origins × all destinations to map the real tiers.
  ```
- **File size:** 170 lines

## Bookable carriers
Count: 34. `3M, 9K, A3, AC, AD, AI, AV, BR, CA, CM, EI, EN, ET, EW, HA, LH, LO, LX, MS, NH, NZ, OA, OS, OU, OZ, SA, SN, SQ, TG, TK, TP, UA, VA, ZH`
Own-metal carriers used for chart selection: `UA`

## Pricing model
- **Structure:** Hybrid zone-pair "observed saver floor" model, explicitly not a fixed published chart. Two separate tables: `FLOORS_US` (any itinerary touching the US, keyed by the non-US zone) and `FLOORS_NONUS` (non-US-origin cross-region pairs, keyed by sorted zone pair), each holding empirically observed minimum ("floor") prices rather than authored chart values. The module's own header flags `FLOORS_NONUS` as stale/disputed against newer scraped data.
- **Distance bands / zones:** 17 zones for the US table (US, AK, HI, MX, CB [Caribbean], CA [Central America], SA1, SA2 [two South America tiers], EU, ME, NAF, AF, CSA [Central/South Asia], NA2 [China/Korea/Taiwan/Mongolia], JP, SEA, OC) keyed by country code, with Hawaii/Alaska further split out of "US" by airport code (`HI_AIRPORTS`, `AK_AIRPORTS`). `FLOORS_NONUS` uses a smaller ad hoc set of cross-region pairs (e.g. `CSA|JP`, `CSA|SEA`, `EU|JP`, `JP|NA2`, `EU|EU`) rather than a full region matrix — 18 populated pairs total.
- **Own vs partner:** No shared `resolveChart` helper; a local `isOwn` boolean requires at least one leg carrier and every leg carrier to be `UA`. For US-touching itineraries, `isOwn` selects between the own-metal floor (`[ownEMin, ownEMax]` economy range, fixed `ownBiz` business) and the partner floor (fixed `ptrEcon`/`ptrBiz`) drawn from the same `FLOORS_US` row. For non-US-origin itineraries, only a single partner-floor value from `FLOORS_NONUS` is used regardless of `isOwn` (no separate own-metal non-US table exists).
- **Seasons:** None — all entries use `season: "default"`.
- **Cabins:** Economy and business are priced throughout; first is always `null` (no first-class floors are modeled); premium_economy is always `null`.
- **Chart selection:** Origin/destination country codes (and, for US endpoints, airport codes) resolve to zones via `getZone()`; if either is unmapped, `handle()` returns `[]`. If either zone is `"US"`, the itinerary is priced from `FLOORS_US` keyed by the non-US zone. Otherwise the order-independent `pairKey(oz, dz)` (locally redefined in this module, not the shared helper) is looked up in `FLOORS_NONUS`; if no row exists, `handle()` falls back to a hardcoded all-zero `"dynamic"` chart entry.

## Output entries
For US-touching own-metal itineraries: one entry `{chart: "saver_floor", season: "default"}` with a true `[ownEMin, ownEMax]` economy range and a fixed `[ownBiz, ownBiz]` business value; first null. For US-touching partner itineraries: one entry `{chart: "partner_floor", season: "default"}` with fixed `[ptrEcon, ptrEcon]` economy and `[ptrBiz, ptrBiz]` business (not ranges); first null. For non-US-origin itineraries with a matched `FLOORS_NONUS` pair: one entry `{chart: "partner_floor", season: "default"}` with fixed `[e,e]`/`[b,b]` values regardless of own/partner status. For non-US-origin itineraries with no matched pair: one fallback entry `{chart: "dynamic", season: "default"}` with economy/business both `[0,0]`. All entries hardcode `programme: "united"`, matching the dir name but differing from the KG slug `united-mileageplus`.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

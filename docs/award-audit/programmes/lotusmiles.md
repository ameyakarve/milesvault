# Vietnam Airlines — Lotusmiles

- **Engine module id:** `lotusmiles`
- **KG slug (`slug` export):** `lotusmiles`
- **Airline / IATA:** Vietnam Airlines (VN)
- **Alliance:** SkyTeam
- **File header note:**
  ```
  Lotusmiles (Vietnam Airlines) — Itinerary-based chart

  VN own-metal: itinerary-based with regular and peak pricing.
  Premium Economy available only on VN, not on partners.
  SkyTeam partner: separate chart (no published rates in vault).
  Multi-leg: per-segment additive.

  Source: vault Award Charts/Lotusmiles.md
  HOW TO REFRESH: Update zone maps and charts below when full chart is published
  ```
- **File size:** 115 lines

## Bookable carriers
Count: 18. `AF, AM, AR, CI, DL, GA, KE, KL, KQ, ME, MF, MU, RO, SK, SV, UX, VN, VS` (per code comment: "SkyTeam members minus OK (Czech Airlines ceased operations)").

Own-metal carriers used for chart selection: `VN` (`VN_CARRIERS`).

## Pricing model
- **Structure:** Zone-pair, per-segment additive. Each leg is resolved to a zone (relative to Vietnam) and priced from a single "regular" one-way table (`VN_OWN`); leg totals are summed across the itinerary. No partner (SkyTeam) chart data exists in the module despite the header describing one.
- **Distance bands / zones:** Zones defined in `ZONE` (by country code): `VN` (domestic), `SEA` (Southeast Asia), `CNE` (China/HK/Taiwan/Macau), `KR` (Korea), `JP` (Japan), `AU` (Australia/NZ), `EU` (a listed set of European countries). Countries not in the map resolve to `null` (no fallback zone).
- **Own vs partner:** `resolveChart(legs, VN_CARRIERS)` (shared helper) classifies the itinerary as `"own"`, `"partner"`, or `"both"`. VN own-metal pricing runs whenever the classification is not `"partner"`. There is no partner-chart branch with data — the source comment notes "SkyTeam partner chart — no published rates in vault," and no `PTR_*` structures exist in this module.
- **Seasons:** The header describes "regular and peak pricing," but only a regular-period table (`VN_OWN`) is implemented; entries are labelled `season: "regular"` and there is no peak-season table or logic in the code.
- **Cabins:** Premium economy is populated only for the Australia (`AU`) and Europe (`EU`) zone rows; the header notes PE is VN-exclusive (not offered on partners, which is moot since no partner chart exists). Economy and business vary by zone (e.g. Japan has no economy value; Australia/Europe have no economy value). First is always `null` — not present in `VN_OWN` or returned.
- **Chart selection:** Per leg: if both `origin_cc` and `destination_cc` are `VN`, the domestic row (`VN_OWN.VN`) is used. Otherwise exactly one end must be `VN`; the foreign country code is zone-resolved via `getZone`, and the corresponding `VN_OWN[zone]` row is used. If neither end is `VN`, or the foreign zone doesn't resolve, that leg is skipped (`allResolved` is tracked but not used to block output — legs that don't resolve simply don't contribute to the totals).

## Output entries
`handle()` returns at most one entry: `{ programme: "lotusmiles", chart: "own", season: "regular", economy, premium_economy, business, first: null }`, emitted only if at least one of economy/premium economy/business accumulated a non-zero contribution (`hasE || hasPE || hasB`). Each populated cabin is the additive per-segment sum, wrapped as a fixed `[v, v]` pair (not a true range); unpopulated cabins are `null`. No partner-chart entry is ever produced by this module.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

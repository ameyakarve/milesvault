# Virgin Atlantic — Flying Club

- **Engine module id:** `flyingclub`
- **KG slug (`slug` export):** `flying-club`
- **Airline / IATA:** Virgin Atlantic (VS)
- **Alliance:** none/unaligned — Virgin Atlantic is not a member of Star Alliance, oneworld, or SkyTeam; the `BOOKABLE` set is a bilateral partner list spanning multiple alliances (SkyTeam carriers, ANA, Air NZ, LATAM, and several unaffiliated carriers), consistent with an independent partner network rather than alliance membership.
- **File header note:** none — the file's docblock has no `Source:` / `HOW TO REFRESH:` lines. Verbatim header present:
  ```
  Virgin Atlantic Flying Club

  Multiple per-partner charts:
  - VS own-metal: dynamic with [min_floor, peak_saver_cap] ranges
  - Delta: region-based (US-UK) + distance-based (all other)
  - ANA: zone-based from Japan, also from US
  - AF/KLM: short-haul distance-based + long-haul zone-based
  - SkyTeam general: distance-based
  - Air NZ: zone-based (return [0,0] — route-specific)
  - LATAM: short-haul distance + long-haul zone
  - Other non-chart partners (SA, WS, 6E, LY, VA, EL AL): return [0,0]
  ```
- **File size:** 314 lines

## Bookable carriers
Count: 26. `6E, AF, AM, AR, CI, DL, GA, KE, KL, KQ, LA, LY, ME, MF, MU, NH, NZ, RO, SA, SK, SV, UX, VA, VN, VS, WS`
Own-metal carriers used for chart selection: `VS` (`VS_CARRIERS` set, single member).

## Pricing model
- **Structure:** hybrid, dispatched per-carrier. `handle()` loops over every distinct carrier found on the legs and appends one entry per matching carrier group, so a single call can return several entries with different chart structures:
  - `VS` (own-metal): dynamic — genuine `[min, max]` ranges built from a universal floor (`VS_MIN`) and a destination-or-origin-specific peak cap.
  - `DL` (Delta): distance-band whole-journey, fixed `[v, v]` pairs.
  - `NH` (ANA): zone-based, direction-dependent (from Japan vs. to Japan), fixed `[v, v]` pairs.
  - `AF`/`KL`: distance-band short-haul + zone-based long-haul, both as genuine `[min, max]` ranges (offpeak/peak).
  - `SKYTEAM_PARTNERS` (`AM, AR, UX, GA, KQ, KE, ME, SK, VN, MF, CI`): distance-band whole-journey, fixed `[v, v]` pairs; also used as the sole fallback chart when no carrier is specified on any leg.
  - `LA` (LATAM): distance-band short-haul + zone-based long-haul (known route pairs only), fixed `[v, v]` pairs.
  - `NZ` (Air NZ): always a fixed `[0,0]` placeholder (route-specific, no chart implemented).
  - `NO_CHART_PARTNERS` (`6E, LY, SA, VA, WS, MU, RO`): always a fixed `[0,0]` placeholder.
- **Distance bands / zones:**
  - Delta (`DL_BANDS`, 9 bands, miles): `[500, 1000, 1500, 2250, 3000, 4000, 5000, 6000, Infinity]`.
  - SkyTeam general (`ST_BANDS`, 10 bands, miles): `[500, 1000, 1500, 2250, 3000, 4000, 5000, 6000, 7000, Infinity]`.
  - AF/KL short-haul (`AFKL_SH_BANDS`, 3 bands, miles): `[600, 1249, 1749]` (applies when total distance ≤ 1749).
  - AF/KL long-haul zone map (`AFKL_ZONE`, 4 zones): `EU`, `AT` (India/South Africa/Indian Ocean), `NAM`, `PA` (Far East/Pacific); only 4 explicit zone pairs are priced (`AT-EU, EU-NAM, EU-PA, AT-PA`).
  - LATAM short-haul (`LA_SH_BANDS`, 5 bands, miles): `[250, 400, 550, 1250, 4000]`; long-haul (>4000 mi) uses 4 explicit country-pair keys (`NAM-PE, NAM-BR, NAM-CL, GB-BR`).
  - VS own-metal uses per-country/per-US-region peak caps (`VS_PEAK_CAPS`, plus separate `VS_US_EAST`/`VS_US_MID` airport sets with their own caps) rather than distance bands; a universal floor (`VS_MIN`) applies everywhere.
  - ANA uses two hand-authored per-country rate tables (`getAnaZoneRate` from Japan, `getAnaToJapanRate` to Japan from `US`/`CA` only, with a same-table reversed fallback).
- **Own vs partner:** dispatch is purely by carrier-set membership (see Structure above); there is no shared own/partner helper — each of the eight branches is independently coded. If legs reference multiple distinct carriers, multiple entries (one per branch) are returned from a single `handle()` call.
- **Seasons:** none — all entries use season `"default"`.
- **Cabins:** varies by branch — VS own-metal prices economy/premium_economy/business (no first); Delta and SkyTeam general price economy/business only; ANA prices economy/business/first (no premium_economy); AF/KL short-haul prices economy/business only, long-haul the same (business `null` when the zone pair's business figures are `0`); LATAM prices economy/premium_economy/business (premium_economy sometimes `null`, e.g. `NAM-PE`); Air NZ and no-chart partners price only fixed `[0,0]` economy/business.
- **Chart selection:** VS: looked up by destination airport/country first (`VS_US_EAST`/`VS_US_MID` airport sets, else country in `VS_PEAK_CAPS`), falling back to origin if destination has no cap, falling back further to a fixed `own_dynamic` `[0,0]` placeholder if neither resolves. Delta/SkyTeam general/LATAM short-haul: `resolveBand` against total distance. ANA/AF-KL long-haul/LATAM long-haul: explicit country-code or zone-pair lookup tables, falling back to `[0,0]` when the specific pair isn't in the table.

## Output entries
`handle()` can return multiple entries per call (one per distinct carrier group encountered, or a single SkyTeam-general entry when no carrier is specified). Chart labels used: `own` (VS), `own_dynamic` (VS fallback), `delta`, `ana`, `afkl`, `latam`, `airnz`, `skyteam_partner`, `partner_dynamic`; season is always `"default"`. Values are a mix of genuine `[min, max]` ranges (VS own-metal; AF/KL short-haul and long-haul) and fixed `[v, v]` singleton pairs (Delta, ANA, SkyTeam general, LATAM, Air NZ, no-chart partners, VS `own_dynamic` fallback). The `programme` field is hardcoded as `"flyingclub"` on every entry, matching the module id but differing in format from the `slug` export `"flying-club"`.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

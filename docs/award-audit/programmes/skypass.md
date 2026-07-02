# Korean Air — SKYPASS

- **Engine module id:** `skypass`
- **KG slug (`slug` export):** `skypass`
- **Airline / IATA:** Korean Air (KE)
- **Alliance:** SkyTeam
- **File header note:**
  ```
  SKYPASS (Korean Air)

  - KE own-metal: zone-based with peak (1.5x) and off-peak. Returns [offpeak, peak].
  - SkyTeam partner: zone-based, round-trip only (halved for one-way). No peak/off-peak.

  Source: koreanair.com + vault Award Charts/SKYPASS.md
  HOW TO REFRESH: Update zone maps and charts below
  ```
- **File size:** 129 lines

## Bookable carriers
Count: 23. `AF, AM, AR, AS, CI, CZ, DL, EK, G3, GA, JL, KE, KL, KQ, ME, MF, MU, RO, SK, SV, UX, VN, VS`
Own-metal carriers used for chart selection: `KE`

## Pricing model
- **Structure:** Zone-pair chart, split into two separate tables: `KE_OWN` (one-way, off-peak base with a 1.5x peak multiplier computed in code) and `PTR` (SkyTeam partner, round-trip figures that `handle()` halves for one-way).
- **Distance bands / zones:** 14 named zones (KR, JP, CN, NEA, SEA, SWA, NAM, CAM, SAM, EU, ME, AF, OC, plus the implicit "JP" used directly in a couple of partner keys) keyed by country code, e.g. KR→KR, JP→JP, CN/MO→CN, HK/TW/MN→NEA, Southeast Asia→SEA, South/Southwest Asia (IN, LK, MV, NP, BD, PK, UZ)→SWA, US/CA/MX/PR→NAM, Central America/Caribbean→CAM, South America→SAM, Europe/Russia/Turkey→EU, Middle East→ME, Africa→AF, Oceania (AU, NZ, FJ)→OC. `KE_OWN` has 12 populated pair rows (all touching KR or NAM); `PTR` has 18 populated pair rows.
- **Own vs partner:** No shared `resolveChart` helper is used; logic is inlined. If leg carriers are empty (unspecified) or every specified carrier is `KE`, the KE own-metal table (`KE_OWN`) is checked; if a row exists, the own entry is returned immediately (function exits early — no partner entry can accompany it). Any itinerary with at least one non-KE carrier, or with no populated `KE_OWN` row, falls through to the `PTR` (partner) lookup instead.
- **Seasons:** KE own-metal distinguishes peak vs off-peak: `handle()` returns `[offpeak, peak]` as the range, with peak computed in code as `Math.round(v * 1.5)` of the off-peak value — not two separate chart-authored seasons. The partner chart (`PTR`) has no peak/off-peak distinction. Both branches label their single entry `season: "default"`.
- **Cabins:** Economy and business ("prestige" for KE own-metal) are priced on all populated rows in both tables; first is priced on many rows but is `0` (nulled) on several (e.g. `KR|KR` in `KE_OWN`; `CN|CN`, `ID|ID`, `SAM|SAM`, `ME|ME`, and `EU|EU` in `PTR`, the last of which also has business nulled); premium_economy is always `null`.
- **Chart selection:** Origin/destination country codes resolve to zones via the `ZONE` map; if either is unmapped, `handle()` returns `[]`. The order-independent `pairKey(oz, dz)` is looked up first in `KE_OWN` (own-metal path) and then, if not returned early, in `PTR` (partner path).

## Output entries
`handle()` returns at most one entry, chosen by branch: `{chart: "own", season: "default"}` for confirmed all-KE itineraries with a populated `KE_OWN` row, where economy/business/first are true `[offpeak, peak]` ranges (peak = 1.5x off-peak, rounded) — zero values wrap to `null`. Otherwise `{chart: "partner", season: "default"}` for itineraries with a populated `PTR` row, where the round-trip chart value is halved and returned as a fixed `[v/2, v/2]` (not a true range) — zero values wrap to `null`. If neither table has a populated row, `handle()` returns `[]`.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

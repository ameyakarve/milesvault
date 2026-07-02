# Xiamen Airlines — Egret Club

- **Engine module id:** `egretclub`
- **KG slug (`slug` export):** `egret-club`
- **Airline / IATA:** Xiamen Airlines (MF)
- **Alliance:** SkyTeam
- **File header note:**
  ```
  Egret Club (Xiamen Airlines) — Distance-based / Route-based chart

  MF own-metal: route-based (international) and distance-based (domestic).
    Premium Economy available on short-haul international only.

  SkyTeam partner: distance-based chart (km) with 1:2:2.5 ratio (Economy:Business:First).
    8 distance tiers for international routes.

  Multi-leg: per-segment pricing.

  Source: vault Award Charts/Egret Club.md
  HOW TO REFRESH: Update charts below
  ```
- **File size:** 202 lines

## Bookable carriers
Count: 19. `AF, AM, AR, AZ, CI, DL, GA, KE, KL, KQ, ME, MF, MU, RO, SK, SV, UX, VN, VS`
Own-metal carriers used for chart selection: `MF`

## Pricing model
- **Structure:** Hybrid, per-segment additive across legs. Own-metal (MF) uses a distance-based chart for CN-CN domestic legs and a route/zone-based chart for international legs (one end must be China); partner (SkyTeam, non-MF) uses a purely distance-based chart for both domestic and international legs. Each leg's cabin costs are computed independently and summed into running totals per chart.
- **Distance bands / zones:**
  - `MF_DOM_BANDS` (own-metal domestic, km): `[500, 1000, 1500, 2000, 3000, Infinity]`
  - `PTR_DOM_BANDS` (partner domestic, km): `[500, 1000, 1500, 2000, 3000, Infinity]`
  - `PTR_INTL_BANDS` (partner international, km): `[1000, 1500, 2000, 3000, 5000, 7000, 10000, Infinity]`
  - Own-metal international uses a route/zone lookup instead of bands: `MF_ROUTE_ZONE` maps foreign country codes to one of 8 zone keys (`HKMACTW`, `JPKR`, `SEA`, `S_ASIA`, `OCEANIA`, `M_EAST`, `EUROPE`, `N_AM`), and each zone key indexes into the `MF_INTL` chart object for a fixed `[economy, premium_economy, business, first]` row.
- **Own vs partner:** `resolveChart(legs, MF_CARRIERS)` (shared helper) determines the chart based on which legs' `carrier` is `MF` vs not: `"own"` if all specified-carrier legs are MF, `"partner"` if none are, `"both"` if mixed or if no leg specifies a carrier. The own-metal block runs when `chart !== "partner"`; the partner block runs when `chart !== "own"` — so both blocks can produce entries when `chart === "both"`.
- **Seasons:** None — both output entries hardcode `season: "default"`; no peak/off-peak branching exists in the file.
- **Cabins:** Own-metal: economy, premium_economy, business, first are all considered, but premium_economy is `null` in the `MF_INTL` rows for zones `S_ASIA`, `OCEANIA`, `M_EAST`, `EUROPE`, `N_AM` (non-null only for `HKMACTW`, `JPKR`, `SEA`, and for all domestic bands via `MF_DOM`). Partner: economy, business, first are priced (via `PTR_DOM`/`PTR_INTL`, both 3-column `[economy, business, first]` tables); premium_economy is always `null` in the partner entry.
- **Chart selection:** Distance in km is derived from `leg.distance` (assumed statute miles, per the `milesToKm` comment) via `milesToKm(miles) = miles * 1.60934`. For own-metal legs: if `origin_cc === "CN" && destination_cc === "CN"`, the domestic chart/band is used; otherwise the leg is treated as international only if exactly one end is `"CN"` (legs with neither end in China are skipped, setting `allResolved = false`, which is computed but not read elsewhere in the shown code), and the foreign country code's mapped zone (via `MF_ROUTE_ZONE`) selects the `MF_INTL` row. For partner legs: `origin_cc === destination_cc` selects the domestic band table, otherwise the international band table; both are indexed via `resolveBand(distKm, bands)`.

## Output entries
`handle()` can return up to two entries: `{programme: "egretclub", chart: "own", season: "default", ...}` and `{programme: "egretclub", chart: "partner", season: "default", ...}`, each only pushed if at least one cabin total was accumulated (`hasE || hasPE || hasB || hasF` / `hasE || hasB || hasF`). Each cabin field is produced by a local `wrap(has, v) => has ? [v, v] : null` helper (not the shared `makeEntry`), so every non-null cabin value is a fixed `[v, v]` pair (min equals max) — there are no true `[min, max]` ranges anywhere in this module. The `programme` field is hardcoded as the string `"egretclub"` (matching the engine module id), which differs from the `slug` export value `"egret-club"`.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

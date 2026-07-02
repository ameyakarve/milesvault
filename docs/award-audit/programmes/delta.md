# Delta Air Lines — Delta SkyMiles

- **Engine module id:** `delta`
- **KG slug (`slug` export):** `delta-skymiles`
- **Airline / IATA:** Delta Air Lines (DL)
- **Alliance:** SkyTeam — the `BOOKABLE` set (`9K, AF, AM, AR, CI, CZ, DL, GA, HA, KE, KL, KQ, LA, ME, MF, MU, RO, SV, TN, UX, VN, VS, WS`) is composed of SkyTeam members and SkyTeam-adjacent partners (e.g. AF, KL, KE, CZ, MU, VN, GA, SV alongside DL itself), consistent with SkyTeam membership.
- **File header note:**
  ```
  Delta SkyMiles — Dynamic pricing with observed minimums

  Returns [minimum, average] as range. No guaranteed pricing.
  Minimums from AwardWallet tracking data (Sept 2023, verified Jan 2026).

  Source: vault Award Charts/Delta SkyMiles.md, AwardWallet unofficial chart
  HOW TO REFRESH: Update FLOORS below with new observed minimums from AwardWallet
  ```
- **File size:** 107 lines

## Bookable carriers
Count: 23. `9K, AF, AM, AR, CI, CZ, DL, GA, HA, KE, KL, KQ, LA, ME, MF, MU, RO, SV, TN, UX, VN, VS, WS`

Own-metal carriers used for chart selection: n/a — the file defines `DL_CARRIERS = new Set(["DL"])` but this constant is never referenced anywhere in `handle()`. The `carriers` local variable computed from `legs` (`const carriers = legs.map((l) => l.carrier).filter(Boolean);`) is likewise computed but never used again. `resolveChart` from `shared.js` is not imported or called, and the module imports only `makeEntry` from `shared.js`. Chart/pricing selection is driven entirely by origin/destination zone, not by which carrier operates the flight.

## Pricing model
- **Structure:** Zone-pair lookup of observed cash-equivalent minimums ("floors"), not a per-segment distance-band chart and not a true dynamic-pricing calculation. `haversine`/`resolveBand`/`pairKey` from `shared.js` are not used.
- **Distance bands / zones:** No distance bands. A `ZONE` map assigns each ISO country code to one of: `US` (US/CA/MX), `CB` (Caribbean), `CA` (Central America), `NSA` (northern South America), `SSA` (southern South America), `EU` (Europe, plus RU, TR, MA), `ME` (Middle East, plus IL, EG, JO), `IS` (Indian subcontinent), `EA` (East Asia, plus GU), `SEA` (Southeast Asia), `AF` (listed African countries), `OC` (AU/NZ/FJ). For US country code specifically, `getZone` further special-cases airport code into `HI` (`HNL, OGG, KOA, LIH, ITO, MKK`) or `AK` (`ANC, FAI, JNU, SIT, KTN`) before falling back to `US`. Countries not present in `ZONE` (and not US) resolve to `null`.
- **Own vs partner:** Not modeled — see "Own-metal carriers" above. Chart output does not vary by which carrier(s) operate the itinerary.
- **Seasons:** None — every returned entry hardcodes `season: "default"`.
- **Cabins:** `economy` and `business` are priced (derived from the `FLOORS` table's `main`/`basic` and `deltaone` values respectively). `premium_economy` and `first` are always `null` in every code path.
- **Chart selection:** `handle(legs)` computes the origin zone (`oz`) from the first leg's `origin_cc`/`origin` and the destination zone (`dz`) from the last leg's `destination_cc`/`destination`. If either is `null` (country/airport not in the zone map), it returns `[]`. Otherwise it picks `zone = oz === "US" ? dz : (dz === "US" ? oz : null)` — i.e. it requires (by literal string equality) that one endpoint's zone be exactly `"US"`, and uses the *other* end's zone as the lookup key into `FLOORS`. Because `HI` and `AK` are distinct zone values from `"US"`, an itinerary where neither endpoint's zone literally equals `"US"` (e.g. both endpoints international, or Hawaii-to-Alaska) falls into `zone === null`. If `zone` is `null`, or `FLOORS[zone]` is missing/all-zero (`IS` and `SEA` are defined as `[0,0,0]`), the function returns a single fixed entry: `{ programme: "delta", chart: "dynamic", season: "default", economy: [0,0], premium_economy: null, business: [0,0], first: null }`. Otherwise it destructures `[basic, main, deltaone] = floor`. A second all-zero check (`basic === 0 && main === 0 && deltaone === 0`) is unreachable at this point since it re-tests a condition already excluded by the prior `FLOORS[zone]` all-zero check; if it were reached it would return `makeEntry("delta", "dynamic", "default", 0, null, 0, null)`.

## Output entries
`handle()` returns at most one entry per call (or `[]` when a zone can't be resolved). Every entry uses `programme: "delta"` — a hardcoded string distinct from the module's own `slug` export (`"delta-skymiles"`), as a factual observation. Two possible `chart` values appear: `"dynamic"` (the no-zone / no-data fallback, `season: "default"`, `economy: [0,0]`, `business: [0,0]`, `premium_economy`/`first`: `null`) and `"observed_floor"` (the normal path, `season: "default"`).

In the `"observed_floor"` path the final object is built as a literal (not via `makeEntry`): `economy: wrap(main || basic)` and `business: wrap(deltaone)`, where `wrap(v) = v === 0 ? null : [v, v]`. Only one of the two floor numbers (`main`, falling back to `basic` only if `main` is falsy) is used for `economy`, and it is wrapped into an equal-value pair `[v, v]`. `business` is likewise `[deltaone, deltaone]` or `null` if `deltaone` is `0`. In the unreachable dead-code branch, `makeEntry` also only ever produces `[v, v]` pairs. Across every reachable code path, all non-null cabin values are fixed `[v, v]` pairs — no entry produces a true `[min, max]` range with distinct minimum and maximum, despite the file's header comment describing the return shape as `[minimum, average]`.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

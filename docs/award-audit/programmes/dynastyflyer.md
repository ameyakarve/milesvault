# China Airlines — Dynasty Flyer

- **Engine module id:** `dynastyflyer`
- **KG slug (`slug` export):** `dynasty-flyer`
- **Airline / IATA:** China Airlines (CI)
- **Alliance:** SkyTeam
- **File header note:**
  ```
  Dynasty Flyer (China Airlines) — Zone-based chart

  CI own-metal: zone-based from Taiwan. One-way = 50% of round-trip.
  Partner (SkyTeam): same zone method, separate pricing (not published in vault).

  Source: vault Award Charts/Dynasty Flyer.md
  HOW TO REFRESH: Update zone maps and charts below
  ```
- **File size:** 97 lines

## Bookable carriers
Count: 19. `AF, AM, AR, CI, DL, GA, KE, KL, KQ, ME, MF, MU, QF, RO, SK, SV, UX, VN, VS`
Own-metal carriers used for chart selection: `CI`

## Pricing model
- **Structure:** Zone-pair chart. Origin and destination country codes are each mapped to a zone via a static `ZONE` lookup table, and the zone pair is looked up in a static `CI_OWN` map (built via a local `co(a, b, e, pe, biz)` helper that stores `[economy, premium_economy, business]` per `pairKey`).
- **Distance bands / zones:** No distance bands. Zone map (`ZONE`): `TW`→TW, `HK`→HK; `JP, KR, CN, TH, VN, ID, PH, SG, MY, MM, KH, LA, IN`→ASIA; `US, CA`→NAM; `GB, DE, FR, NL, IT, AT, CZ`→EU; `AU, NZ`→AUNZ. Chart pairs defined in `CI_OWN`: TW–TW (domestic), TW–HK, ASIA–ASIA, TW–ASIA, HK–ASIA, AUNZ–AUNZ, TW–AUNZ, ASIA–NAM, ASIA–EU, TW–NAM, TW–EU, HK–NAM, HK–EU, ASIA–AUNZ.
- **Own vs partner:** `resolveChart(legs, CI_CARRIERS)` (shared helper, `CI_CARRIERS = {CI}`) determines chart as `"own"`, `"partner"`, or `"both"` based on which legs' carriers are CI vs. non-CI. In `handle()`, the CI own-metal chart is looked up whenever `chart !== "partner"` (i.e. for `"own"` or `"both"`). The SkyTeam partner branch is a no-op — the code comment states partner pricing uses the same zone method but rates are not published in the vault, so no partner entry is ever produced.
- **Seasons:** None — all entries use `season: "default"`; there is no peak/off-peak distinction in the code.
- **Cabins:** Economy and premium economy and business are priced from the `CI_OWN` chart values (each individually nullable per entry, e.g. domestic TW–TW has premium economy and business both `null`). First class is not priced — `handle()` always sets `first: null`.
- **Chart selection:** Origin country code (`legs[0].origin_cc`) and destination country code (`legs[legs.length - 1].destination_cc`) are mapped to zones via `getZone()`. If either resolves to no zone, `handle()` returns `[]`. Otherwise `pairKey(oz, dz)` is looked up in `CI_OWN`; if no entry exists for that zone pair, no own-metal entry is produced.

## Output entries
`handle()` returns at most one entry, with `programme: "dynastyflyer"`, `chart: "own"`, `season: "default"`. Economy/premium_economy/business values are each wrapped as fixed `[v, v]` (or `null`); `first` is always `null`. There are no true `[min, max]` ranges — every non-null cabin value uses the single-scalar `[v, v]` wrap pattern (done inline in `handle()`, not via the shared `makeEntry`). The `programme` field is hardcoded to the literal string `"dynastyflyer"`, which differs in format from the `slug` export `"dynasty-flyer"` (no hyphen vs. hyphenated).

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

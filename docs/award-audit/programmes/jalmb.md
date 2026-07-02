# Japan Airlines — JAL Mileage Bank

- **Engine module id:** `jalmb`
- **KG slug (`slug` export):** `jal-mileage-bank`
- **Airline / IATA:** Japan Airlines (JL)
- **Alliance:** oneworld
- **File header note:**
  ```
  JAL Mileage Bank

  - JL own-metal: city-pair pricing from static route data
  - Non-oneworld partner chart: distance-based, one-way
  - Oneworld multi-carrier: cumulative distance, round-trip (not implemented)
  ```
- **File size:** 88 lines (plus imported `routes.js`, which supplies `ROUTES` and `ALIASES`)

## Bookable carriers
Count: 21. `AA, AF, AS, AT, AY, BA, CX, EK, FJ, GA, IB, JL, KE, LA, MH, PG, QF, QR, RJ, UL, WY`

Own-metal carriers used for chart selection: `JL` (`JL_CARRIERS`).

## Pricing model
- **Structure:** Hybrid — JL own-metal uses a city-pair lookup table (`ROUTES`, imported from `./routes.js`) keyed by the non-Japan airport; the non-oneworld partner chart is a distance-band whole-journey chart based on `totalDistance`.
- **Distance bands / zones:** Partner chart only: `PTR_BANDS = [1000, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 20000, 25000, 29000, 34000, 50000]` (13 bands), resolved against the itinerary's total distance via `resolveBand`. Own-metal has no bands — it is a direct route lookup, not distance-derived.
- **Own vs partner:** `resolveChart(legs, JL_CARRIERS)` from `shared.js` classifies the itinerary as `"own"`, `"partner"`, or `"both"`. If not `"partner"`, own-metal pricing is attempted; if not `"own"`, the partner distance-band chart is applied — both entries can be returned for `"both"`.
- **Seasons:** None — own-metal and partner entries both use `season: "default"`.
- **Cabins:** Own-metal: economy, premium economy, and business come from fixed `ROUTES` values; first is a `[low, high]` range if both a low (`fL`) and high (`fH`) first-class value are present in the route row, else `null`. Partner chart: all four cabins (economy, premium economy, business, first) are populated from `PTR_CHART`.
- **Chart selection:** Own-metal requires exactly one end of the itinerary to be a Japan airport (checked against a `JAPAN_AIRPORTS` set of ~24 domestic airports); the other end (`foreignAirport`) is looked up directly in `ROUTES`, falling back to `ALIASES[foreignAirport]` if no direct entry exists. If both ends are Japan (domestic) or neither is Japan, no own-metal entry is produced. Partner chart selection is purely `resolveBand(totalDistance, PTR_BANDS)`, independent of geography.

## Output entries
`handle()` can return up to two entries:
- `{ programme: "jalmb", chart: "own", season: "default", economy, premium_economy, business, first }` — economy/premium economy/business are fixed `[v, v]` pairs (via a local `wrap`); first is a true `[fL, fH]` range when both bounds are present in the route row, otherwise `null`.
- Partner entry built via the shared `makeEntry("jalmb", "partner", "default", e, pe, b, f)` — all four cabins are fixed `[v, v]` pairs.

Both entries use the literal `programme: "jalmb"`, matching the module's own dir name (which differs from the `slug` export, `"jal-mileage-bank"`).

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

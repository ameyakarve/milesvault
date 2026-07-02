# Iberia — Iberia Plus (Avios)

- **Engine module id:** `iberia`
- **KG slug (`slug` export):** `iberia-plus`
- **Airline / IATA:** Iberia (IB)
- **Alliance:** oneworld
- **File header note:**
  ```
  Iberia Club (Avios) — Distance-based with 9 bands

  - Iberia own-metal: Off-Peak and Peak pricing. Returns [offpeak, peak] where known.
  - Partner: same distance bands but no peak/off-peak

  Source: vault Award Charts/Iberia Plus.md (compiled from search results, chart removed from IB website May 2025)
  ```
- **File size:** 92 lines

## Bookable carriers
Count: 17. `AA, AS, AT, AV, AY, BA, CX, FJ, IB, JL, LA, MH, QF, QR, RJ, UL, WY`

Own-metal carriers used for chart selection: `IB` (`IB_CARRIERS`).

## Pricing model
- **Structure:** Distance-band, per-segment additive (comment: "same as BA"). Each leg's distance is banded independently and the per-band cabin values are summed across all legs in the itinerary.
- **Distance bands / zones:** `IB_BANDS = [650, 1150, 2000, 3000, 4000, 5500, 6500, 7000, Infinity]` (9 bands, upper-bound miles, resolved via the shared `resolveBand` helper).
- **Own vs partner:** `chart = carriers.every((c) => IB_CARRIERS.has(c)) ? "own" : "partner"` — if every leg with a specified carrier is IB, the itinerary is priced as `"own"`; otherwise `"partner"`. Both own and partner pricing pull from the same per-band `IB_OFFPEAK` / `IB_PEAK` tables (there is no separate partner table); the distinction only affects the `chart` label on the single emitted entry.
- **Seasons:** Off-peak (`IB_OFFPEAK`) and peak (`IB_PEAK`) tables exist per band. Only bands 5 and 6 have real peak data (`[19500, 40250, 59000]` and `[24250, 50500, 74000]`); bands 1–4, 7, 8, 9 have `[0, 0, 0]` placeholder peak rows. In `handle()`, if a leg's peak row for that band is `0`, the code falls back to using the off-peak value for the peak total as well (`hasPeakData` stays `false` for that leg). The final entry uses `[lo, hi]` only if `hasPeakData` was set true by at least one leg with real peak data; otherwise both bounds equal the off-peak total.
- **Cabins:** Economy (labelled "comfort_econ" in the source comment), premium economy, and business are priced; first is always `null` (not present in the tables and not returned).
- **Chart selection:** No zone/region lookup — purely `resolveBand(leg.distance, IB_BANDS)` per leg, independent of leg origin/destination countries.

## Output entries
`handle()` returns a single entry: `{ programme: "iberia", chart: "own"|"partner", season: "default", economy, premium_economy, business, first: null }`.

Cabin values are `null` if the summed off-peak total is `0`; otherwise they are `[lo, hi]`, where `hi` equals `lo` (a fixed `[v, v]` pair) unless real peak data (`hasPeakData`) was found for at least one leg, in which case `hi` is the true (higher) peak-based total — a genuine `[min, max]` range in that case.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

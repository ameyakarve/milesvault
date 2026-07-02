# Virgin Australia — Velocity Frequent Flyer

- **Engine module id:** `velocity`
- **KG slug (`slug` export):** `velocity-frequent-flyer`
- **Airline / IATA:** Virgin Australia (VA)
- **Alliance:** none/unaligned
- **File header note:**
  ```
  Velocity Frequent Flyer (Virgin Australia) — Dynamic pricing

  VA own-metal: fully dynamic, no published chart. Return [0,0].
  Partners: EY, DL, SQ, HU — also dynamic/no published chart.

  Source: vault Frequent Flyer Programmes/Velocity Frequent Flyer.md
  HOW TO REFRESH: If VA ever publishes a static chart, add it here
  ```
- **File size:** 21 lines

## Bookable carriers
Count: 11. `AC, HU, HX, NH, QR, SA, SG, SQ, UA, VA, VS`
Own-metal carriers used for chart selection: n/a — no own/partner distinction is made in the code (no own-carrier set is defined, and `handle()` does not branch on `legs` at all).

## Pricing model
- **Structure:** Fully dynamic placeholder — no zone map, distance bands, or chart data of any kind. `handle()` ignores the `legs` argument entirely.
- **Distance bands / zones:** n/a.
- **Own vs partner:** n/a — the module makes no distinction; every call returns the same single zero-value entry regardless of carrier.
- **Seasons:** None — the single entry uses `season: "default"`.
- **Cabins:** Economy and business are always populated as `[0, 0]` (see Output entries note below); premium_economy and first are always `null`.
- **Chart selection:** n/a — no lookup logic exists.

## Output entries
`handle()` unconditionally returns a single entry `{chart: "dynamic", season: "default"}` built via the shared `makeEntry` helper, called as `makeEntry("velocity", "dynamic", "default", 0, null, 0, null)`. `makeEntry`'s wrap function only converts `null`/`undefined` to `null` — a literal `0` is wrapped as `[0, 0]` — so the entry actually carries `economy: [0, 0]` and `business: [0, 0]` (fixed, not a true range), while `premium_economy`/`first` (passed as literal `null`) are `null`. The entry hardcodes `programme: "velocity"`, matching the dir name but differing from the KG slug `velocity-frequent-flyer`.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

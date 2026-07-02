# LATAM Airlines — LATAM Pass

- **Engine module id:** `latampass`
- **KG slug (`slug` export):** `latam-pass`
- **Airline / IATA:** LATAM Airlines (LA)
- **Alliance:** unknown — verify (the module's own `BOOKABLE` set mixes carriers from multiple alliances — e.g. `BA`/`CX`/`AY`/`IB`/`JL`/`QF`/`QR`/`RJ` (oneworld), `LH`/`OS`/`LX` (Star Alliance), `DL`/`AM`/`VS` (SkyTeam/Virgin) — consistent with LATAM operating bilateral partnerships rather than a single alliance membership in this data)
- **File header note:**
  ```
  LATAM Pass — Fully dynamic pricing

  LATAM own-metal: fully dynamic, no published chart. Return [0,0].
  Partner awards: unpublished pricing, phone-only booking. Return [0,0].

  Partners include DL, AM, BA, CX, AY, IB, JL, LH, OS, QF, QR, RJ, LX, VS

  Source: vault Award Charts/LATAM Pass.md
  HOW TO REFRESH: If LATAM ever re-publishes a static chart, add it here
  ```
- **File size:** 23 lines

## Bookable carriers
Count: 15. `LA, DL, AM, BA, CX, AY, IB, JL, LH, OS, QF, QR, RJ, LX, VS`

Own-metal carriers used for chart selection: n/a — the module does not distinguish own vs. partner carriers in code; there is no own-carrier `Set` defined, and `handle()` ignores `legs` carrier identity entirely.

## Pricing model
- **Structure:** Fully dynamic placeholder. No chart, no zone map, no distance bands — `handle()` unconditionally returns a single fixed placeholder entry regardless of the input itinerary.
- **Distance bands / zones:** n/a.
- **Own vs partner:** Not distinguished — the same placeholder entry (`chart: "dynamic"`) is returned whether the itinerary is LATAM metal or a partner airline; the module never inspects `legs[].carrier`.
- **Seasons:** n/a — single `season: "default"`.
- **Cabins:** Economy and business are set to `0`; premium economy and first are always `null` (per the `makeEntry` call arguments).
- **Chart selection:** None — `handle(legs)` takes `legs` as a parameter but does not read from it; it always returns the same placeholder entry.

## Output entries
`handle()` returns exactly one entry via the shared `makeEntry("latampass", "dynamic", "default", 0, null, 0, null)` helper: `{ programme: "latampass", chart: "dynamic", season: "default", economy: [0, 0], premium_economy: null, business: [0, 0], first: null }`. Economy and business are fixed `[0, 0]` pairs (not a real min/max range — both bounds are literally zero); premium economy and first are `null`. The `programme` field is the literal string `"latampass"`, matching the module's dir name (differs from the `slug` export, `"latam-pass"`).

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

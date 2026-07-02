# British Airways — Avios

- **Engine module id:** `ba`
- **KG slug (`slug` export):** `avios`
- **Airline / IATA:** British Airways (BA)
- **Alliance:** oneworld
- **File header note:** none (no Source/HOW TO REFRESH docblock).
- **File size:** 105 lines

## Bookable carriers
Count: 26. `3M, 6E, 9K, AA, AS, AT, AY, B6, BA, CX, CZ, EI, EY, FJ, G3, HA, IB, JL, LA, MH, QF, QR, RJ, TN, UL, WY`
Own-metal carriers used for chart selection: `BA, IB, EI` (the `BA_CARRIERS` set — British Airways, Iberia, Aer Lingus, the IAG own-metal group)

## Pricing model
- **Structure:** distance-band **per-segment additive** pricing. Unlike the other modules read, this one prices each leg independently against its own `leg.distance` and then sums cabin totals across all legs in the itinerary (per the code comment: "BA uses per-segment additive pricing — sum each leg independently"). The `handle()` function's `totalDistance` parameter (`_totalDistance`) is unused.
- **Distance bands / zones:** `BA_BANDS = [650, 1151, 2000, 3000, 4000, 5500, 6500, 7000, Infinity]` (9 bands). Three chart tables of 9 rows each: `BA_OWN_OFFPEAK`, `BA_OWN_PEAK`, `BA_PARTNER`, all `[economy, premium_economy, business, first]`.
- **Own vs partner:** `resolveChart(legs, BA_CARRIERS)` yields `own`/`partner`/`both`. Own-metal computes both season variants (off-peak and peak) by summing each leg's own-chart row; partner sums each leg's `BA_PARTNER` row. If the result is `"own"`, only the two own-metal entries are returned (partner is skipped entirely). If `"both"`, own-metal entries and the partner entry are concatenated.
- **Seasons:** own-metal has two — "off-peak" and "peak" — both always computed and returned as separate entries whenever own-metal applies. Partner has none (`season: "default"`).
- **Cabins:** all four (economy, premium_economy, business, first) exist on all three tables, though premium_economy and first are `null` in the first four (short-haul) rows of both own-metal tables.
- **Chart selection:** `resolveBand(leg.distance, BA_BANDS)` is applied per leg, and the resulting row's four cabin values are added into running per-cabin totals across all legs.

## Output entries
Up to 3 entries: own-metal "off-peak" and "peak" (`chart: "own"`, only if the itinerary isn't partner-only), and a partner "default" entry (`chart: "partner"`, only if the itinerary isn't own-only). Each cabin total is the sum of per-leg values wrapped as a fixed `[v,v]` pair; a total of `0` renders as `null`. All values are fixed `[v,v]`, never true ranges. The `programme` field is hardcoded to `"ba"`, which differs from the `slug` export `"avios"`.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

## Award chart verification notes (July 2026)

**BA1–4 (CX/JL premium table, AA/AS US-domestic table, QR/AY devaluation
exemption, multi-carrier chart) remain PARKED — no instrument.** BA has no
seats.aero feed, and the second live instrument (Roame skyview,
`selectedPrograms=BRITISH_AIRWAYS`, program num 450) was tried 2026-07-02:
the cached-fares GraphQL (`FareSearch` on `/encore/graphql`) returns an empty
fare list for BA-programme searches even on flagship routes (LHR–JFK J,
wide date range, surcharge cap raised) — the BA crawl on Roame is genuinely
empty, confirmed manually by the owner. Negative documented; own + standard
partner tables in `programmes/ba/index.js` stay as verified by the earlier
migration pass, and the four gap findings stay flagged in the module header
comment. Revisit only with a new instrument (e.g. a BA calculator session).

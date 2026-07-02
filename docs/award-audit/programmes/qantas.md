# Qantas — Qantas Frequent Flyer

- **Engine module id:** `qantas`
- **KG slug (`slug` export):** `qantas-frequent-flyer`
- **Airline / IATA:** Qantas (QF)
- **Alliance:** oneworld
- **File header note:** none — the file has no header comment block; it opens directly with the `import` statement, only carrying an inline comment ("Initial set — will be updated after deep research") above the `BOOKABLE` set.
- **File size:** 136 lines

## Bookable carriers
Count: 26. `AA, AF, AS, AT, AY, BA, CI, CX, EK, FJ, HA, IB, JL, KL, LA, LY, MH, MU, NZ, PG, QF, QR, RJ, UL, WS, WY`
Own-metal carriers used for chart selection: `QF_CARRIERS = {QF, AA, FJ}` (labeled chart `"own"`); also `EK_CARRIERS = {EK}` (labeled `"emirates"`) and `JQ_CARRIERS = {JQ, GK, 3K}` (labeled `"jetstar"`) are treated as separate named charts rather than "partner". Any other carrier falls into the general `"partner"` chart.

## Pricing model
- **Structure:** distance-band per-segment additive — each leg's distance is resolved to a band index and each leg's per-cabin cost is summed across all legs into one itinerary total.
- **Distance bands / zones:** `QF_BANDS = [600, 1200, 2400, 3600, 4800, 5800, 7000, 8400, 9600, 15000]` (10 bands/rows), shared across all four charts (`QF_OWN`, `QF_PARTNER`, `QF_EMIRATES`, `QF_JETSTAR`).
- **Own vs partner:** if no leg has a carrier specified, `handle()` sums and returns three separate entries (own, partner, emirates) computed independently over the same legs/bands. If carriers are specified, each leg is priced per-leg against whichever chart its carrier maps to (`QF_EMIRATES` for EK, `QF_OWN` for QF/AA/FJ, `QF_JETSTAR` for JQ/GK/3K, else `QF_PARTNER`), and the per-cabin totals are summed into one entry.
- **Seasons:** none — the label used is always `"default"`.
- **Cabins:** `QF_OWN`, `QF_PARTNER`, and `QF_EMIRATES` price all four cabins (`economy, premium_economy, business, first`). `QF_JETSTAR` only has economy and business (no premium_economy/first row values — those cabins simply aren't accumulated for Jetstar legs).
- **Chart selection:** in the multi-leg summation loop, `chartName` is overwritten on every iteration, so the final entry's `chart` label reflects only the last leg processed, even though earlier legs in a mixed itinerary may have been priced against a different chart. Jetstar legs (`continue`) skip premium_economy/first accumulation for that leg.

## Output entries
When no carrier is specified: three entries with chart labels `"own"`, `"partner"`, `"emirates"` (season `"default"`), each summed across all legs' bands. When carriers are specified: a single entry whose `chart` label is whichever chart matched the last leg in the loop, with cabin totals summed across all legs. `wrap(v) => v === 0 ? null : [v, v]` is applied throughout, so all values are fixed `[v, v]` pairs (zero totals become `null`), not true `[min, max]` ranges. The `QF_EMIRATES` chart is commented as "effective March 31, 2026."

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

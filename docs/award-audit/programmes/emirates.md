# Emirates — Skywards

- **Engine module id:** `emirates`
- **KG slug (`slug` export):** `emirates-skywards`
- **Airline / IATA:** Emirates (EK)
- **Alliance:** none/unaligned — Emirates is not a member of Star Alliance, oneworld, or SkyTeam. The file's own-carrier set (`EK_CARRIERS`) contains only `EK`, and the module explicitly returns no chart for EK-only itineraries (no static own-metal chart), consistent with Emirates operating outside any alliance.
- **File header note:** none — the file has no top-of-file `Source:` / `HOW TO REFRESH:` docblock; only inline `//` comments annotate individual chart blocks (e.g. "New Standard partner chart (March 4, 2026)", "Legacy partner chart (AC, JL, Jetstar, UA)", "Qantas separate chart (March 4, 2026)", "Dynamic pricing partners (FZ, U2, LS) — no fixed chart").
- **File size:** 91 lines

## Bookable carriers
Count: 22. `A3, AC, AD, CM, DE, EK, FZ, G3, GA, JL, JQ, KE, LS, MH, MK, OA, PG, QF, SA, TP, U2, UA`
Own-metal carriers used for chart selection: `EK` (`EK_CARRIERS` set, single member) — used only to detect and *skip* own-metal pricing, not to price it.

## Pricing model
- **Structure:** distance-band whole-journey (per `resolveBand` against a single `distance` value passed into `handle`), hybrid across four separate partner-only charts: a "Standard" chart, a "Legacy" chart, a Qantas-specific chart, and a set of dynamic-pricing partners with no chart at all.
- **Distance bands / zones:** three distinct 10-band distance arrays (miles):
  - `STD_BANDS`: `[300, 500, 700, 900, 1500, 2000, 3000, 4000, 5000, Infinity]`
  - `LEGACY_BANDS`: `[250, 500, 1000, 2000, 3000, 4000, 5000, 6000, 7000, Infinity]`
  - `QF_BANDS`: `[600, 1200, 2400, 3600, 4800, 5800, 7000, 8400, 9600, Infinity]`
- **Own vs partner:** Emirates own-metal (EK-only itineraries) is explicitly skipped — `handle()` returns `[]` when every specified carrier is `EK`, per the comment "Emirates doesn't publish a static chart." All produced entries are partner charts, selected by which named carrier(s) appear on the legs:
  - `QF` → `QF_CHART` (`partner_qantas`)
  - `LEGACY_PARTNERS` (`AC, JL, JQ, UA`) → `LEGACY_CHART` (`partner_legacy`)
  - `STD_PARTNERS` (`A3, MK, AD, PG, DE, CM, GA, G3, KE, MH, OA, SA, TP`) → `STD_CHART` (`partner`)
  - `DYNAMIC_PARTNERS` (`FZ, U2, LS`) → no chart, fixed `[0,0]` placeholder (`partner_dynamic`)
  - If no carrier is specified on any leg, `handle()` returns all three static charts (Standard, Legacy, Qantas) as candidate entries using the same total `distance` value.
- **Seasons:** none — all entries use season `"default"`.
- **Cabins:** `STD_CHART` and `QF_CHART` rows have 3 values destructured as `[e, pe, b]` → economy, premium_economy, business priced; first always `null`. `LEGACY_CHART` rows have 3 values destructured as `[e, pe, b]` where the array's middle element is a literal `null` and the third element is passed through as business — so economy and business are priced, premium_economy and first are always `null`. The dynamic-partner entry has economy `[0,0]` and business `[0,0]`; premium_economy and first are `null`.
- **Chart selection:** For each unique non-EK carrier found on the legs, the matching partner-set membership determines which chart/band pair is used (checked in order: Qantas, then Legacy, then Standard, then Dynamic). A carrier not present in any of the four sets produces no entry for that carrier. When no carrier is specified at all, the Standard, Legacy, and Qantas charts are all returned as separate entries (Dynamic is not included in this no-carrier default).

## Output entries
`handle()` can return 0–3 entries per call, using chart labels `partner` (Standard), `partner_legacy`, `partner_qantas`, and `partner_dynamic`, all with season `"default"`. Every entry is built via `makeEntry`, whose `wrap` helper turns each single numeric value into a fixed `[v, v]` pair (not a true `[min, max]` range) — so all economy/premium_economy/business/first values returned by this module are fixed pairs. The `programme` field on every entry is hardcoded as `"emirates"`, matching the module id but differing in format from the `slug` export `"emirates-skywards"`.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

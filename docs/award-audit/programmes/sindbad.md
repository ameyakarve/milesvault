# Oman Air — Sindbad

- **Engine module id:** `sindbad`
- **KG slug (`slug` export):** `sindbad`
- **Airline / IATA:** Oman Air (WY)
- **Alliance:** none/unaligned
- **File header note:**
  ```
  Sindbad (Oman Air) — Zone-based own-metal chart from Muscat

  Uses Sindbad miles (NOT Avios). Fixed zone-based pricing, 6 zones.
  Partner awards: no published chart, return [0,0].

  Source: sindbad.omanair.com mileage calculator API (Mar 2026)
  HOW TO REFRESH: Query sindbad.omanair.com/SindbadProd/mileageCalculator for routes
  ```
- **File size:** 64 lines

## Bookable carriers
Count: 19. `AA, AC, AS, AT, AY, BA, CX, EY, FJ, IB, JL, KL, MH, QF, QR, RJ, TK, UL, WY`
Own-metal carriers used for chart selection: `WY`

## Pricing model
- **Structure:** Fixed zone chart, own-metal only, keyed to/from Oman (OM). Partner itineraries have no published chart and always price at zero.
- **Distance bands / zones:** 7 zones (0–6) keyed by the "foreign" (non-OM) country code: zone 0 = OM (domestic); zone 1 = AE/QA/BH; zone 2 = KW/SA; zone 3 = IN/PK; zone 4 = LK/MV/JO/EG/TR/BD/NP/LB; zone 5 = TH/KE/TZ/GR; zone 6 = GB/DE/FR/IT/CH/NL/DK/ES/MA/MY/ID/PH/CN/AT/SE/PT.
- **Own vs partner:** No `resolveChart` shared helper is used. `handle()` treats the itinerary as own-metal only if `legs` has at least one carrier and every leg carrier is WY; otherwise it is priced as partner (always `[0,0]`, i.e. `null` after wrapping).
- **Seasons:** None — all entries use `season: "default"`.
- **Cabins:** Economy and business are priced for all 7 zone rows; a third "business studio" value doubles as the `first` field (populated, i.e. non-zero, only for zones 5 and 6); premium_economy is always `null`.
- **Chart selection:** For own-metal itineraries, the "foreign" country code is derived as whichever of origin/destination is not OM (defaults to destination if neither/both is OM), mapped to a zone via `ZONE`, and the corresponding `CHART[zone]` row is used. If the foreign country code has no zone mapping, the own-metal path falls back to an all-zero entry.

## Output entries
`handle()` returns exactly one entry per call. For qualifying WY-only itineraries with a resolved zone: `{chart: "own", season: "default"}` with fixed `[v,v]` values (not ranges) for economy/business, where a chart value of `0` is treated specially by a local wrap function and returned as `null`; `first` is populated only where the chart's third ("business studio") column is non-zero (zones 5 and 6), else `null`; premium_economy is always `null`. For WY-only itineraries with no resolved zone, and for all non-WY (partner) itineraries, the entry is `{chart: "own", season: "default"}` or `{chart: "partner", season: "default"}` respectively, built via the shared `makeEntry` helper called with literal `0` args for economy/business — but `makeEntry`'s own wrap function only nulls `null`/`undefined`, not `0`, so these fallback entries actually carry `economy: [0, 0]` and `business: [0, 0]` (not `null`), while `first`/`premium_economy` (passed as literal `null`) are `null`.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

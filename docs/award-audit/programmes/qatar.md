# Qatar Airways — Qatar Privilege Club

- **Engine module id:** `qatar`
- **KG slug (`slug` export):** `qatar-privilege-club`
- **Airline / IATA:** Qatar Airways (QR)
- **Alliance:** oneworld
- **File header note:**
  ```
  Qatar Privilege Club

  - QR own-metal: route-specific pricing (Off-Peak/Peak/Flexi), not distance-based
    Return [offpeak, peak] ranges for known route categories from Doha
  - Partner: distance-based chart (9 bands), per-segment additive
  - AA/AS: separate chart for under 3,000mi
  - LATAM: separate chart

  Source: qatarairways.com + vault Award Charts/Qatar Privilege Club.md
  HOW TO REFRESH: Update charts below, verify via QR's "My Calculator" tool
  ```
- **File size:** 180 lines

## Bookable carriers
Count: 23. `AA, AS, AT, AY, B6, BA, CX, FJ, GA, HA, IB, JL, LA, ME, MF, MH, PG, QF, QR, RJ, UL, VA, WY`
Own-metal carriers used for chart selection: `QR` (`QR_CARRIERS`). Two additional partner-specific carrier sets are used for sub-chart selection rather than "own": `AA_AS_CARRIERS = {AA, AS}` and `LA_CARRIERS = {LA}`.

## Pricing model
- **Structure:** hybrid. QR own-metal is route/zone-specific (not distance-banded), keyed off which end of the itinerary is not Qatar. Partner pricing is distance-band, per-segment additive, with two special-case bands/charts (AA/AS, LATAM) that override the general partner chart for qualifying legs.
- **Distance bands / zones:**
  - QR own-metal: 10 destination zones (`ME_SHORT, IS, EU_SHORT, EU_LONG, SEA, EA, AF, NAM, SAM, OC`), each mapped from the non-Qatar endpoint's country code via `QR_DEST_ZONE`.
  - General partner chart: `PTR_BANDS = [650, 1151, 2000, 3000, 4000, 5500, 6500, 7000, Infinity]` (9 bands).
  - AA/Alaska chart: `AA_BANDS = [650, 1151, 2000, 3000]` (4 bands), only applied when leg distance ≤ 3000mi.
  - LATAM chart: `LA_BANDS = [650, 1151, 2000, 3000, 4000, 5000]` (6 bands), only applied when leg distance ≤ 5000mi.
- **Own vs partner:** if every leg's carrier is `QR`, the module returns a single own-metal entry (chart `"own"`) based on destination zone and stops. Otherwise, each leg is priced individually: AA/AS legs ≤3000mi use the AA chart (`"partner_aa"`), LA legs ≤5000mi use the LATAM chart (`"partner_latam"`), all other legs use the general partner chart (`"partner"`) via `resolveBand`.
- **Seasons:** the label used is always `"default"`. However, unlike the other programmes documented here, the QR own-metal cabin values are genuine two-number ranges (`[offpeak, peak]`, with peak comment noted as "≈1.3x offpeak") rather than a doubled single value.
- **Cabins:** QR own-metal prices economy and business as `[offpeak, peak]` ranges; first is present only for some zones (wrapped to `null` when both offpeak/peak are `0`); premium_economy is always `null`. General partner chart prices all four cabins. AA chart prices economy plus a combined business/first figure (stored in the `business` field; `first` is `null`). LATAM chart prices economy and business only (`first` is `null`).
- **Chart selection:** for own-metal, the "foreign" country code is whichever end isn't `QA`, mapped through `QR_DEST_ZONE` to pick the `QR_OWN` row; if unmapped, an all-zero entry is emitted via `makeEntry`. For partner legs, `resolveChart` (from shared.js) is not used in this module — carrier/distance checks are done directly per leg, and if more than one leg entry results, they are summed into a single entry whose `chart` label is taken from the last leg processed in the loop (the same "last leg wins" pattern as the `qantas` module).

## Output entries
Own-metal path returns one entry: chart `"own"`, season `"default"`, with economy/business as true `[offpeak, peak]` ranges and first either a range or `null`. Partner path: if only one leg, returns that leg's entry as-is (chart one of `"partner"`, `"partner_aa"`, `"partner_latam"`, values built via `makeEntry`'s `[v, v]` wrap — fixed, not ranges); if multiple legs, returns one summed entry with `chart` equal to the last leg's chart label, cabin totals summed and wrapped as `[v, v]` (zero becomes `null`).

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).
- [ ] **IndiGo (`6E`) bookability.** seats.aero shows Qatar (`qatar-privilege-club`) awards on `6E` for India→US/HK/LHR connections, but `6E` is not in this module's `BOOKABLE` set → those options come back `NOT-BOOKABLE`. Likely rule: Qatar books IndiGo **only on connections routed via Doha (DOH)** (IndiGo feeds QR's DOH hub). Verify the Doha-only condition before adding `6E` — adding it unconditionally would wrongly price `6E` on non-DOH routings.

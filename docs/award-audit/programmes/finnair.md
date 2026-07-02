# Finnair — Finnair Plus

- **Engine module id:** `finnair`
- **KG slug (`slug` export):** `finnair-plus`
- **Airline / IATA:** Finnair (AY)
- **Alliance:** oneworld — the file header states "Each oneworld partner: unique zone-based chart", and the `BOOKABLE` set (AA, AS, AT, AY, BA, CX, FJ, HA, IB, JL, LA, MH, QF, QR, RJ, UL, WY) matches oneworld membership.
- **File header note:**
  ```
  Finnair Plus (Avios) — Per-partner zone-based charts

  - Finnair own-metal: zone-based from Helsinki, no peak/off-peak
  - Each oneworld partner: unique zone-based chart
  - BA: uses BA's own distance-based pricing (handled by BA module, not here)

  Source: vault Award Charts/Finnair Plus.md
  HOW TO REFRESH: Update routes.js with new per-partner charts
  ```
- **File size:** 263 lines (the module also imports per-partner numeric charts — `AS_CHART, AA_CHART, CX_CHART, IB_CHART, JL_CHART, MH_CHART, QR_CHART, QF_CHART, UL_CHART` — from a co-located `routes.js`, 117 lines).

## Bookable carriers
Count: 17. `AA, AS, AT, AY, BA, CX, FJ, HA, IB, JL, LA, MH, QF, QR, RJ, UL, WY`
Own-metal carriers used for chart selection: `AY` (`AY_CARRIERS` set, single member).

## Pricing model
- **Structure:** zone-pair, per-partner — one own-metal zone chart (Finnair, from Helsinki) plus nine independent bespoke zone-resolver/chart pairs, one per supported oneworld partner (`AS`/`HA` combined, `AA`, `CX`, `IB`, `JL`, `MH`, `QR`, `QF`, `UL`). British Airways (`BA`) is explicitly excluded — `handle()` returns `[]` for BA-operated legs, deferring to a separate BA module.
- **Distance bands / zones:** own-metal `AY_ZONE` (keyed by country code, 6 zones from Helsinki): `FI_NE` (Finland/Nordics/Baltics), `CE` (Central Europe), `WSE` (Western/Southern Europe), `CAN` (Israel, Turkey — labeled "Canaries/Levant"-style bucket in code as `CAN`), `ME_IN` (Qatar, UAE, India, Sri Lanka), `ASIA_LH` (Asia-Pacific and North America long-haul). Each of the nine partner resolvers defines its own ad hoc set of zone labels and country-code groupings (e.g. `resolveAA` uses `NAM/EU/CB/SAM/CAM/APAC`; `resolveCX` uses `HK/CN/ASIA/EU/SP/NAM/SAM`; `resolveQR` and `resolveUL` require one endpoint to be Qatar/Sri Lanka respectively).
- **Own vs partner:** own-metal applies only when every specified leg carrier is `AY`; the "foreign" country code (whichever end isn't Finland) is looked up in `AY_ZONE`. Otherwise, a single leg carrier (`carriers[0]` — the first carrier found across legs, not a check that all legs share one carrier) is used to select which of the nine partner resolver/chart pairs applies; an unrecognized or absent carrier, or a zone pair the resolver doesn't recognize, yields `[]`.
- **Seasons:** none — all entries use season `"default"`, per the header note "no peak/off-peak".
- **Cabins:** own-metal (`AY_CHART`) rows are `[economy, premEcon, business]`; first is always `null`; a `0` value in the chart (used where a cabin isn't offered) is treated as `null` by the output `wrap` function. Partner charts (from `routes.js`) are 4-value rows documented there as `[economy, premEcon/business2, business, first]`; `handle()` destructures them as `[e, b2, _b, f]` and maps the **second** array value (`b2`) into the output's `business` field, while the **third** value (`_b`, which `routes.js`'s own header comment labels "business") is read but never used. Output `premium_economy` is always `null` for every partner chart, regardless of chart contents.
- **Chart selection:** each partner resolver maps origin/destination country codes into that partner's own zone labels, then looks up the resulting key (trying both `"zoneA-zoneB"` and `"zoneB-zoneA"` in most resolvers) in that partner's chart object from `routes.js`.

## Output entries
`handle()` returns at most one entry per call: chart `own` (Finnair own-metal) or chart `partner_<carrier>` (lowercased carrier code, e.g. `partner_aa`, `partner_cx`) for whichever single partner carrier was resolved, both with season `"default"`. All values are fixed `[v, v]` pairs, not true ranges. The `programme` field is hardcoded as `"finnair"` on every entry, matching the module id but differing in format from the `slug` export `"finnair-plus"`.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

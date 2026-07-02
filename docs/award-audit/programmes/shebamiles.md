# Ethiopian Airlines — ShebaMiles

- **Engine module id:** `shebamiles`
- **KG slug (`slug` export):** `shebamiles`
- **Airline / IATA:** Ethiopian Airlines (ET)
- **Alliance:** Star Alliance
- **File header note:**
  ```
  ShebaMiles (Ethiopian Airlines) — Zone-based chart

  ET own-metal: 13-zone system. Pricing varies by origin zone.
  Business/First combined into single column.
  Star Alliance partner: dynamic calculator only, no static matrix.

  Source: vault Award Charts/ShebaMiles.md
  HOW TO REFRESH: Update zone maps and charts below
  ```
- **File size:** 182 lines

## Bookable carriers
Count: 26. `A3, AC, AI, AV, BR, CA, CM, ET, G3, LH, LO, LX, MS, NH, NZ, OS, OU, OZ, SA, SN, SQ, TG, TK, TP, UA, ZH`
Own-metal carriers used for chart selection: `ET` (`ET_CARRIERS`). No own-carrier set is used for the partner side because no partner pricing logic is implemented (see below).

## Pricing model
- **Structure:** zone-pair, own-metal only. The header states Star Alliance partner awards use "dynamic calculator only, no static matrix," and correspondingly `handle()` contains no partner-chart lookup code at all — only a comment marking where it would go.
- **Distance bands / zones:** no distance bands. `ZONE` maps country codes to 13 distinct zone codes: `EAF, NAF, SAF, WAF, ME, EU, CA, FE, SEA, OC, NAM, CAC, SAM`. `ET_OWN` (keyed by `pairKey` of zone pairs) covers a partial set of zone-pair combinations, not the full 13×13 matrix.
- **Own vs partner:** `resolveChart(legs, ET_CARRIERS)` is computed, but only its "not `partner`" branch is ever exercised — the "not `own`" (partner) branch has no lookup logic, so no partner entry can ever be produced regardless of carrier composition.
- **Seasons:** the label used is always `"default"`.
- **Cabins:** `ET_OWN` rows are `[economy, businessFirst]` — a single combined value used for both `business` and `first` (both set to `[bf, bf]`), per the header's "Business/First combined into single column" note. `premium_economy` is always `null`.
- **Chart selection:** origin/destination country codes are mapped through `ZONE` via `getZone(cc)`; if either is unmapped, `handle()` returns `[]` immediately (before any own/partner branching). Otherwise the zone pair is looked up via `pairKey` in `ET_OWN`.

## Output entries
`handle()` returns at most one entry: chart `"own"`, season `"default"`, economy `[e, e]`, premium_economy `null`, business `[bf, bf]`, first `[bf, bf]` (business and first are always identical). No partner entry is ever produced — the partner branch in `handle()` is a comment with no accompanying code. All values are fixed `[v, v]` pairs, not true `[min, max]` ranges.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

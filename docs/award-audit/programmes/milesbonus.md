# Aegean Airlines — Miles+Bonus

- **Engine module id:** `milesbonus`
- **KG slug (`slug` export):** `miles-and-bonus`
- **Airline / IATA:** Aegean Airlines (A3), with Olympic Air (OA) as its regional partner
- **Alliance:** Star Alliance
- **File header note:**
  ```
  Miles+Bonus (Aegean Airlines) — No published award chart

  A3 own-metal and OA (Olympic Air): no static award chart in vault.
  Star Alliance partner: no static award chart in vault.

  Miles+Bonus uses a dynamic/calculator-based system. No published zone matrix
  or distance-based chart is available. Returns empty results.

  Source: no vault Award Chart file exists
  HOW TO REFRESH: If a static chart is published, add zone maps and chart data
  ```
- **File size:** 24 lines

## Bookable carriers
Count: 27. `A3, AC, AI, AV, BR, CA, CM, ET, LH, LO, LX, MS, NH, NZ, OA, OS, OU, OZ, SA, SN, SQ, TG, TK, TP, UA, VL, ZH`
Own-metal carriers used for chart selection: n/a — the module defines no own-carrier set and performs no carrier-based branching.

## Pricing model
- **Structure:** none implemented. `handle()` unconditionally returns an empty array with a comment stating no published award chart exists.
- **Distance bands / zones:** n/a — no zone map, band array, or chart data is defined anywhere in the module.
- **Own vs partner:** not distinguished — there is no logic that inspects `legs` at all.
- **Seasons:** n/a
- **Cabins:** n/a — no cabin values are ever produced.
- **Chart selection:** n/a — no chart lookup exists.

## Output entries
`handle()` always returns `[]` regardless of input. No entries (no chart/season labels, no values) are ever produced by this module.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

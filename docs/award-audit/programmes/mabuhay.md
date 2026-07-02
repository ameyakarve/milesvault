# Philippine Airlines — Mabuhay Miles

- **Engine module id:** `mabuhay`
- **KG slug (`slug` export):** `mabuhay-miles`
- **Airline / IATA:** Philippine Airlines (PR)
- **Alliance:** none/unaligned
- **File header note:**
  ```
  Mabuhay Miles (Philippine Airlines) — Zone-based chart

  PR own-metal: zone-based from Manila. Limited published data.
  Only known rates: domestic minimum, some business fares, upgrade chart.
  Returns available data where zones match, [] for unknown pairs.

  Source: vault Award Charts/Mabuhay Miles.md
  HOW TO REFRESH: Update zone maps and charts below when full chart is published
  ```
- **File size:** 104 lines

## Bookable carriers
Count: 1. `PR`

Own-metal carriers used for chart selection: n/a in practice — a `PR_CARRIERS` set (`{"PR"}`) is declared but is never referenced anywhere in `handle()`; the module has no own-vs-partner branch (see Pricing model).

## Pricing model
- **Structure:** Zone-pair (single zone table keyed from Manila, MNL/PH) — not distance-banded, and with only one chart (no separate own/partner split in the code, even though `BOOKABLE` only contains `PR` anyway).
- **Distance bands / zones:** Zones defined in `ZONE` (by country code): `PH` (domestic), `NEA` (Near East Asia: HK, Macau, Taiwan, China), `SEA` (Southeast Asia), `JP` (Japan/Korea, labelled "Japan / Korea" together), `NAM` (North America, default), `EU`, `ME` (Middle East), `SA` (India/subcontinent), `OC` (Australia/NZ). For `US`/`CA`, `getZone` further splits into `NAM_W` (`LAX`,`SFO`,`SJC`,`YVR`) and `NAM_E` (`JFK`,`EWR`,`ORD`,`YYZ`,`IAD`) via airport sets, defaulting to `NAM` for unmatched US/Canada airports.
- **Own vs partner:** Not implemented — `handle()` always produces a single `chart: "own"` entry regardless of the actual operating carrier of any leg; no partner chart or logic exists.
- **Seasons:** None — single `"default"` season.
- **Cabins:** The `FROM_PH` table rows only ever have non-null values for economy (domestic, `PH`, only) and business (`SEA`, `NAM_W`, `NAM_E`, `NAM`); every other cell, and premium economy and first entirely, are `null` across all zones.
- **Chart selection:** Itinerary must have one endpoint in the Philippines (`PH`), checked via `legs[0].origin_cc` / the last leg's `destination_cc`; otherwise `[]`. The foreign-side country/airport is zone-resolved via `getZone`; if unresolved, or if the resolved `FROM_PH` row is all-`null`, `[]` is returned.

## Output entries
`handle()` returns at most one entry: `{ programme: "mabuhay", chart: "own", season: "default", economy, premium_economy, business, first: null }`, built from `FROM_PH[zone]`. Each non-null cabin value is wrapped as a fixed `[v, v]` pair (not a true range); `null` cells stay `null`. If all of economy, premium economy, and business are `null` for the resolved zone, `handle()` returns `[]` instead.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

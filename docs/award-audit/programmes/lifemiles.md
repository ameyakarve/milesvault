# Avianca — LifeMiles

- **Engine module id:** `lifemiles`
- **KG slug (`slug` export):** `lifemiles`
- **Airline / IATA:** Avianca (AV)
- **Alliance:** Star Alliance
- **File header note:**
  ```
  LifeMiles (Avianca)

  - Avianca own-metal: dynamic (return [0,0])
  - Star Alliance partners: unpublished zone-based chart with crowd-sourced ranges
  - No fuel surcharges on partner awards

  Source: crowd-sourced data, last updated Mar 2026
  HOW TO REFRESH: Update the CHARTS object below with new zone-pair pricing
  ```
- **File size:** 135 lines

## Bookable carriers
Count: 27. `A3, AC, AI, AV, BR, CA, CM, ET, G3, IB, LH, LO, LX, MS, NH, NZ, OS, OU, OZ, SA, SN, SQ, TG, TK, TP, UA, ZH`

Own-metal carriers used for chart selection: `AV` (`AV_CARRIERS`).

## Pricing model
- **Structure:** Hybrid — Avianca (AV) own-metal is a fully dynamic placeholder (`[0,0]`); all other (partner) itineraries use a zone-pair chart (`CHARTS`) keyed by a sorted pair of named zones.
- **Distance bands / zones:** Zones assigned by country code in `ZONE`: `US`, `CA`, `MX` (own zones), `CB` (Caribbean/PR), `CA_AM` (Central America), `SA_N` (northern South America: CO, EC, VE, PE), `SA_S` (southern South America: BR, AR, CL, BO, PY, UY), `EU1`/`EU2`/`EU3` (three Europe sub-zones), `ME` (Middle East/North Africa), `AF` (sub-Saharan Africa), `SA_ASIA` (South Asia incl. India), `NA_ASIA` (North Asia), `SEA` (Southeast Asia), `OC` (Oceania). No airport-level refinement — all zone assignment is by country code only.
- **Own vs partner:** If every leg carrier is in `AV_CARRIERS` (`AV`), the dynamic placeholder is returned immediately. Otherwise, origin/destination country codes are each mapped to a zone via `ZONE`; if either is unmapped, `[]` is returned. The zone pair is looked up (order-independent, via the local `pk`/sorted-key logic) in `CHARTS`.
- **Seasons:** None — single `"default"` season; the "ranges" in the chart values reflect sub-zone variation (per code comment), not seasonality.
- **Cabins:** Economy, business, and first are populated (each as `[min, max]` pairs in the raw chart, with `0` meaning unavailable); premium economy is always `null` for the partner entry.
- **Chart selection:** `CHARTS` is a flat object keyed by `pk(zoneA, zoneB)` (sorted zone-pair string), covering a specific list of zone-to-zone routes (e.g. `US|US`, `US|CA`, `US|EU1`, `SA_ASIA|EU1`, `SA_ASIA|US`, etc.) — not a full cross-product of all zones; unlisted zone pairs return `[]`.

## Output entries
- Own-metal (AV): a single placeholder entry via `makeEntry("lifemiles", "dynamic", "default", 0, null, 0, null)` — `economy: [0, 0]`, `business: [0, 0]`, `premium_economy: null`, `first: null` (fixed zero pairs, not a real range).
- Partner: a single entry `{ programme: "lifemiles", chart: "partner", season: "default", economy, premium_economy: null, business, first }`, where each populated cabin is `wrap(lo, hi)` from the `CHARTS` row — a true `[min, max]` range when `lo !== hi` (reflecting the "crowd-sourced range" data), or `[v, v]` when the chart's low and high values are identical; `wrap` returns `null` only when both `lo` and `hi` are `0`.

Both entries use the literal `programme: "lifemiles"`, matching the `slug` export.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).
- [ ] Business/first coverage on Roame is thin (economy-heavy cache) — re-probe
  premium cabins for the unverified zone pairs when the crawl deepens.

## Award chart verification notes (July 2026)

First live verification, via **Roame skyview** (`selectedPrograms=LIFEMILES`,
`FareSearch` on `/encore/graphql`) — the seats.aero LifeMiles feed remains
empty. Six zone pairs observed, wide date window (Jul 2026–Apr 2027), nonstop:

| Probe | Zone pair | Observed (pts, ops, count) | Chart before | Verdict |
|---|---|---|---|---|
| BOG–MIA | AV own | Y 26,100/31,900/38,300; J 81,500/94,000 (AV, x469) | dynamic `[0,0]` | CONSISTENT (dynamic, tiered) |
| EWR–FRA | US\|EU2 | Y 41,100/48,400 (UA **and** LH, x45) | Y [40k,40k] | **FIXED** — Y max → 48,400 |
| SFO–ORD | US\|US | Y 17,800 (UA, x23) | Y [7.5k,15k] | **FIXED** — Y max → 17,800 |
| FRA–LHR | EU1\|EU2 | Y 8,200/9,600 (LH, x102) | Y [12.5k,12.5k] | **FIXED** — Y min → 8,200 |
| SFO–NRT | US\|NA_ASIA | Y 55,100/64,900 (UA **and** NH, x768) | Y [55k,55k] | **FIXED** — Y max → 64,900 |
| ORD–YYZ | US\|CA | Y 10,200/12,100 (UA+AC, x677) ✓ in range; J 34,100 (UA, x2) | J [15k,25k] | Y CONFIRMED; **FIXED** — J max → 34,100 |
| DEL–SIN | SA_ASIA\|SEA | J 55,400 (SQ, x1) | J [35k,45k] | **FIXED** — J max → 55,400 (single obs, weakest) |
| DEL–FRA, IAH–PTY, FRA–IST | — | no cached fares | — | NO DATA (absence ≠ evidence) |

**Structural finding:** partner pricing is no longer fixed saver levels — every
observed route shows 2–3 non-round tiers (dynamic-ish), corroborated across two
operating carriers on both transatlantic and transpacific probes. The module
keeps the zone-pair envelope model; ranges were widened only where a live price
fell outside, never narrowed, and unobserved pairs were left at crowd values.

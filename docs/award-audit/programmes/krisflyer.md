# Singapore Airlines — KrisFlyer

- **Engine module id:** `krisflyer`
- **KG slug (`slug` export):** `krisflyer`
- **Airline / IATA:** Singapore Airlines (SQ)
- **Alliance:** Star Alliance
- **File header note:**
  ```
  KrisFlyer Award Charts

  SQ metal: 13-zone matrix with Saver and Advantage tiers → returns [saver, advantage] ranges
  Partner (Star Alliance): 12-zone matrix with single fixed rate → returns [rate, rate]

  All values stored in hundreds (e.g., 85 = 8,500 miles) to keep arrays compact.
  Multiply by 100 before returning.
  ```
- **File size:** 121 lines (plus imported `charts.js`, which supplies `SQ_ECO_S`, `SQ_ECO_A`, `SQ_BIZ_S`, `SQ_BIZ_A`, `SQ_FIRST_S`, `SQ_FIRST_A`, `SQ_PE_S`, `PTR_ZONE`, `PTR_ECO`, `PTR_BIZ`, `PTR_FIRST`)

## Bookable carriers
Count: 30. `A3, AC, AI, AV, BR, CA, CM, ET, GA, HO, LH, LO, LX, MH, MS, NH, NZ, OS, OU, OZ, SA, SN, SQ, TG, TK, TP, TR, UA, VA, ZH`

Own-metal carriers used for chart selection: `SQ, TR` (`SQ_CARRIERS` — SQ metal plus Scoot).

## Pricing model
- **Structure:** Hybrid zone-matrix — SQ metal uses a 13-zone × 13-zone matrix (per-cabin, per-tier matrices in `charts.js`) indexed by origin/destination zone; the Star Alliance partner chart uses a separate zone map (`PTR_ZONE`) and per-cabin matrices (`PTR_ECO`, `PTR_BIZ`, `PTR_FIRST`), described in the header as a 12-zone matrix.
- **Distance bands / zones:** SQ metal — 13 zones defined in `SQ_ZONE` (by country code), with airport-level overrides for Australia (`SQ_Z8_AIRPORTS`, e.g. `PER`, `DRW` → Zone 8; other `AU`/`NZ` default to Zone 9) and for US/Canada west coast (`SQ_Z12_AIRPORTS`, e.g. `LAX`, `SFO`, `YVR` → Zone 12; other `US` defaults to Zone 13, `CA` defaults to Zone 12 by country map). Zones: 1 Singapore, 2 SEA1, 3 SEA2, 4 North Asia 1, 5 North Asia 2, 6 Central/South Asia, 7 Japan/S. Korea, 8 SW Pacific 1, 9 SW Pacific 2, 10 Africa/ME/Turkey, 11 Europe, 12 US West, 13 US East. Partner chart zones are defined separately in `charts.js` via `PTR_ZONE` (not enumerated in `index.js`).
- **Own vs partner:** Both SQ-metal and partner lookups can run independently in the same call: `isSqMetal` is true only if every leg carrier is in `SQ_CARRIERS`; `isPartner` is true only if every leg carrier is not in `SQ_CARRIERS`. SQ-metal pricing runs if `!isPartner`; partner pricing runs if `!isSqMetal` — so mixed itineraries can produce both entries, and an itinerary with no carriers specified produces both (since neither `isSqMetal` nor `isPartner` is true when `carriers.length === 0`).
- **Seasons:** No season dimension — both entries use `season: "default"`. Instead of peak/off-peak, SQ metal has two *tiers*, Saver and Advantage, returned as a `[saver, advantage]` range per cabin.
- **Cabins:** SQ metal — economy, premium economy (Saver-only, no Advantage tier), business, first. Partner chart — economy, business, first; premium economy is always `null` for the partner entry.
- **Chart selection:** SQ metal: zone resolved via `getSqZone(cc, airport)` for both origin and destination; if either resolves to a falsy zone, no SQ-metal entry is added. Partner: zone resolved via direct `PTR_ZONE[cc]` lookup (no airport-level overrides); if either origin or destination zone is `undefined`, no partner entry is added.

## Output entries
`handle()` can return up to two entries:
- `{ programme: "krisflyer", chart: "own", season: "default", economy, premium_economy, business, first }` — each cabin value is read from the hundreds-scaled matrices, multiplied by 100. Economy/business/first are `[saverValue, advantageValue || saverValue]` — a true `[min, max]` range when a distinct Advantage value exists, otherwise a fixed `[v, v]` pair. Premium economy is a fixed `[v, v]` pair (Saver-only) or `null`.
- `{ programme: "krisflyer", chart: "partner", season: "default", economy, premium_economy: null, business, first }` — values are read from `PTR_ECO`/`PTR_BIZ`/`PTR_FIRST` via a local `half` function that multiplies the stored value by `500` (code comment: "Partner chart is round-trip; halve for one-way"). All non-null partner cabins are fixed `[v, v]` pairs.

Both entries use the literal `programme: "krisflyer"`, matching the `slug` export.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

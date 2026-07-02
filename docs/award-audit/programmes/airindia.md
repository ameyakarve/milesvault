# Air India — Maharaja Club

- **Engine module id:** `airindia`
- **KG slug (`slug` export):** `maharaja-club`
- **Airline / IATA:** Air India (AI)
- **Alliance:** Star Alliance
- **File header note:** none in `index.js` (no Source/HOW TO REFRESH docblock). The companion data file `routes.js` carries its own header comment: "Air India Maharaja Club route pricing / Format: \"ORIGIN|DEST\" → [eMin,eMax,peMin,peMax,bMin,bMax,fstMin,fstMax] / 0 = cabin not available. 193 routes refreshed 2026-04-01."
- **File size:** 31 lines (`index.js`); route data lives separately in `routes.js`.

## Bookable carriers
Count: 25. `A3, AC, AI, AV, BR, CA, CM, ET, LH, LO, LX, MS, NH, NZ, OS, OU, OZ, SA, SN, SQ, TG, TK, TP, UA, ZH`
Own-metal carriers used for chart selection: n/a. The module has no own/partner split at all; it only requires that at most one distinct carrier code appears across all legs (`carriers.size > 1` → return `[]`).

## Pricing model
- **Structure:** fixed chart — a direct route-pair (airport-pair) lookup table (`ROUTES`, imported from `routes.js`), not zone- or distance-based.
- **Distance bands / zones:** n/a. Pricing is keyed directly by a specific origin–destination airport pair; there are 193 routes per the `routes.js` header comment (refreshed 2026-04-01).
- **Own vs partner:** no distinction in code. The same `ROUTES` table is used regardless of which single carrier (or no carrier) is specified; the only gate is that all legs must share one carrier code (or have none specified), else the function returns `[]`.
- **Seasons:** none — the single entry uses `season: "default"`.
- **Cabins:** economy, premium_economy, business, first are all present per route row (8 values: `eMin,eMax,peMin,peMax,bMin,bMax,fMin,fMax`); a cabin renders as `null` when its min/max pair is `[0,0]`.
- **Chart selection:** `pairKey(firstLeg.origin, lastLeg.destination)` (direction-agnostic airport-pair key) looked up directly in `ROUTES`.

## Output entries
A single entry, `chart: "airindia"`, `season: "default"`. Unlike most other modules, cabin values here are true `[min,max]` ranges taken directly from the `ROUTES` table via a local `wrap()` helper (not the shared `makeEntry`, which only supports fixed single values). The `programme` field is hardcoded to `"airindia"`, which differs from the `slug` export `"maharaja-club"`.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

# Turkish Airlines — Miles&Smiles

- **Engine module id:** `turkish`
- **KG slug (`slug` export):** `turkish-miles-and-smiles`
- **Airline / IATA:** Turkish Airlines (TK)
- **Alliance:** Star Alliance
- **File header note:** none (no top-of-file comment block in this module)
- **File size:** 218 lines

## Bookable carriers
Count: 29. `A3, AC, AD, AI, AV, BR, CA, CM, ET, G3, LH, LO, LX, MS, NH, NZ, OA, OS, OU, OZ, SA, SN, SQ, TG, TK, TP, UA, VL, ZH`
Own-metal carriers used for chart selection: `TK`

## Pricing model
- **Structure:** Region-pair chart (12 named regions), split into a same-region "TK operated" table (`TK_OPERATED`, own-metal, Turkey-anchored routes) and a full region×region "partner" pair matrix (`TK_PARTNER`), plus two special fixed tables for US domestic (`TK_DOMESTIC`) and Turkey–Hawaii (`TK_HAWAII`) itineraries.
- **Distance bands / zones:** 12 regions keyed by country code: Türkiye; Europe 1 (GB, FR, DE, NL, BE, CH, AT, IE, DK, SE, NO, FI, LU, IS); Europe 2 (IT, ES, PT, GR, PL, RO, BG, CZ, HU, HR, RS, SK, SI, Balkans, Baltics, CY, MT, MD, UA, BY, GE, AM, AZ, RU); Central Asia (IN, PK, BD, LK, NP, MV, AF, KZ, UZ, TM, KG, TJ, MN); Middle East; North Africa (MA, TN, DZ, LY, EG); Central Africa (West/Central African states); Southern Africa (ZA, KE, TZ, ET, and other East/Southern African states); Far East (CN, HK, TW, JP, KR, SE Asia, MO, TL); North America (US, CA, MX); South America (includes Central America and the Caribbean in this map). `TK_OPERATED` has all 12 regions populated but is only used for Türkiye-anchored routes; `TK_PARTNER` has the full 66-pair upper triangle of the 12 regions populated (excluding Türkiye-to-others, which routes through `TK_OPERATED` instead).
- **Own vs partner:** `resolveChart(legs, TK_CARRIERS)` (shared helper) classifies as `"own"` (all legs TK), `"partner"` (no legs TK), or `"both"`. TK-operated pricing (`chart !== "partner"`) applies to: (a) Türkiye-domestic itineraries; (b) itineraries with one endpoint in the Türkiye region; and (c) itineraries that merely transit a Türkiye leg (checked via `legs.some(...)` over origin/destination country codes of every leg), in which case the code picks whichever endpoint region has the higher `TK_OPERATED` standard-economy cost as the "TK zone" for pricing. Partner pricing (`chart !== "own"`) applies otherwise, with special-cased Hawaii and US-domestic partner fares layered in before falling back to the `TK_PARTNER` region-pair matrix.
- **Seasons:** TK-operated entries always emit two season rows: `"promotion"` and `"standard"` (both hardcoded, not date-driven). The partner and domestic/Hawaii entries use `season: "default"` only.
- **Cabins:** TK-operated table prices economy and business only (`premium_economy` and `first` are always `null` for these entries, since `makeEntry` is called with only economy/business args). Partner-matrix, domestic, and Hawaii entries price economy, business, and first; premium_economy is always `null` throughout the module.
- **Chart selection:** Origin/destination country codes map to `TK_ZONE` regions; if either is unmapped, `handle()` returns `[]`. For same-region-Türkiye-domestic itineraries (`originZone === destZone === "Türkiye"` and matching country codes) only the TK-operated Türkiye row is used. Otherwise TK-operated pricing (when applicable per the own/partner logic above) looks up `TK_OPERATED[tkZone]`; partner pricing looks up `TK_PARTNER[pairKey(originZone, destZone)]`, with Hawaii itineraries (detected via a fixed `HAWAII_AIRPORTS` set combined with a North-America-zone check) and US-domestic itineraries (same region, both endpoints `"US"`) overriding the matrix lookup with `TK_HAWAII`/`TK_DOMESTIC` fixed values.

## Output entries
For TK-operated pricing, `handle()` can emit two entries per call: `{chart: "tk_operated", season: "promotion"}` and `{chart: "tk_operated", season: "standard"}`, each with fixed `[v,v]` values (not ranges) for economy/business (premium_economy and first always null). For partner pricing, at most one entry `{chart: "partner", season: "default"}` is emitted, with fixed `[v,v]` values for economy/business/first (premium_economy null), sourced from `TK_PARTNER`, `TK_HAWAII`, or `TK_DOMESTIC` depending on route matching. A "both" itinerary can emit up to three entries total (two tk_operated + one partner). All entries hardcode `programme: "turkish"`, matching the dir name but differing from the KG slug `turkish-miles-and-smiles`.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

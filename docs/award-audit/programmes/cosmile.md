# STARLUX Airlines — COSMILE

- **Engine module id:** `cosmile`
- **KG slug (`slug` export):** `cosmile`
- **Airline / IATA:** STARLUX Airlines (JX)
- **Alliance:** none/unaligned (file header identifies this as own-metal only, "no interline award routing"; no alliance is named anywhere in the file)
- **File header note:**
  ```
  COSMILE (STARLUX Airlines) — region-based, two regions

  - Within Asia / Between Asia & America (one-way values)
  - Discounted bucket for the TPE–HKG / TPE–MFM short-hauls
  - STARLUX-operated (JX) only; no interline award routing (own-metal)

  Source: milesvault-kg content/programs/cosmile.md
  ```
- **File size:** 57 lines

## Bookable carriers
Count: 1. `JX`
Own-metal carriers used for chart selection: n/a — there is no separate own-carrier set or `resolveChart` call; `BOOKABLE` (`JX` only) is the sole carrier set defined, and the module does not branch on own-vs-partner carrier.

## Pricing model
- **Structure:** region-pair fixed chart (three hardcoded one-way charts selected by country/market membership, plus one special-case city-pair override); no distance bands, no `resolveBand`/`resolveChart` calls.
- **Distance bands / zones:** n/a (no distance bands). Region/market definitions:
  - `ASIA_CC`: a fixed set of country codes — `TW, HK, MO, CN, JP, KR, TH, VN, MY, SG, PH, ID, KH`.
  - A special city-pair override for `TPE–HKG` / `TPE–MFM` (checked via IATA airport codes, independent of the country-code sets).
- **Own vs partner:** not modeled — only one carrier (`JX`) exists in `BOOKABLE`, and `handle()` does not inspect leg carriers at all.
- **Seasons:** none — every entry is labeled season `"default"`; no peak/off-peak distinction exists.
- **Cabins:** economy, premium_economy, and business are priced (non-null) in all three charts. First is priced in `WITHIN_ASIA` (40000) and `ASIA_AMERICA` (120000), but is `null` in `HK_MACAU` (comment: "no First sold").
- **Chart selection:** `handle()` takes the first leg's origin IATA/country-code and the last leg's destination IATA/country-code, then: (1) if the o/d pair is `TPE`+`HKG` or `TPE`+`MFM` (via `isHkMacauSpecial`, order-independent) → `HK_MACAU` chart, name `"hk-macau"`; else (2) if both origin and destination country codes are in `ASIA_CC` → `WITHIN_ASIA` chart, name `"within-asia"`; else (3) `ASIA_AMERICA` chart, name `"asia-america"` (fallback for any market touching a non-Asian country).

## Output entries
`handle()` returns a single-element array. The one entry's `chart`/`season` label is one of `"hk-macau"`/`"default"`, `"within-asia"`/`"default"`, or `"asia-america"`/`"default"`, depending on which branch matched. All entries are built via `makeEntry`, so every cabin value is a fixed `[v, v]` range (min equals max), not a true min/max range. The `programme` field passed into `makeEntry` is the string literal `"cosmile"`, matching the module's `slug` export — no label mismatch.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

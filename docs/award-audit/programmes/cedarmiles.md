# Middle East Airlines — Cedar Miles

- **Engine module id:** `cedarmiles`
- **KG slug (`slug` export):** `cedar-miles`
- **Airline / IATA:** Middle East Airlines (ME)
- **Alliance:** none/unaligned — unknown — verify. The file does not state MEA's own alliance membership; it only describes the `BOOKABLE` set as "SkyTeam members minus OK (Czech Airlines ceased operations)" plus QR ("Qatar Airways — non-alliance partner with own chart"), implying ME itself is treated as a separate, non-SkyTeam carrier with its own chart.
- **File header note:**
  ```
  Cedar Miles (Middle East Airlines) — Zone-based chart

  MEA own-metal: 10-zone system centred on Beirut. Limited published rates.
  SkyTeam partner: separate chart (higher rates). Qatar Airways: separate chart.
  Only known rate: Zone 5 (London/Europe) from Beirut.

  Source: vault Award Charts/Cedar Miles.md
  HOW TO REFRESH: Update zone maps and charts when full matrix is published
  ```
- **File size:** 100 lines

## Bookable carriers
Count: 18. `AF, AM, AR, CI, DL, GA, KE, KL, KQ, ME, MF, MU, QR, RO, SV, UX, VN, VS`
Own-metal carriers used for chart selection: `ME` (`ME_CARRIERS` set, single member).

## Pricing model
- **Structure:** zone-pair, with only the MEA own-metal chart implemented. Partner charts (SkyTeam, Qatar Airways) are referenced in comments but have no computed pricing — the module returns no entries for `chart === "partner"`.
- **Distance bands / zones:** No distance bands. A 10-zone map (`ZONE`) keyed by country code, centred on Beirut:
  - Zone 1: Lebanon (LB)
  - Zone 2: Bahrain, Iran, Iraq, Kazakhstan, Kyrgyzstan, Kuwait, Oman, Qatar, Saudi Arabia, UAE, Uzbekistan, Yemen
  - Zone 3: Armenia, Azerbaijan, Cyprus, Egypt, Georgia, Jordan, Syria, Turkey
  - Zone 4: Sub-Saharan Africa (Angola, Cameroon, DR Congo, Ethiopia, Ghana, Kenya, Madagascar, Mauritius, Morocco, Nigeria, Senegal, South Africa, Tanzania, Tunisia, Uganda)
  - Zone 5: Europe (Albania, Austria, Belgium, Denmark, Finland, France, Germany, UK, Greece, Hungary, Ireland, Italy, Netherlands, Norway, Poland, Portugal, Romania, Russia, Spain, Sweden, Switzerland, Ukraine)
  - Zone 6: India
  - Zone 7: East & Southeast Asia (China, Japan, Korea, Mongolia, Cambodia, Hong Kong, Indonesia, Malaysia, Nepal, Philippines, Singapore, Sri Lanka, Taiwan, Thailand, Vietnam)
  - Zone 8: USA, Canada
  - Zone 9: Alaska, Mexico, Central America, South America, Caribbean (Mexico, Guatemala, Honduras, El Salvador, Nicaragua, Costa Rica, Panama, Brazil, Argentina, Chile, Colombia, Peru, Venezuela, Ecuador, Cuba, Dominican Republic, Jamaica, Bahamas, Barbados, Trinidad and Tobago)
  - Zone 10: Australasia (Australia, New Zealand, Fiji)
  - Special case: `getZone` maps US airports `ANC`, `FAI`, `JNU` (Alaska) to Zone 9 instead of Zone 8 (`AK_AIRPORTS` set).
- **Own vs partner:** `resolveChart(legs, ME_CARRIERS)` (shared helper) classifies the itinerary as `"own"`, `"partner"`, or `"both"`. Pricing is only produced when `chart !== "partner"` (i.e. `"own"` or `"both"`) AND one endpoint (origin or destination) resolves to Zone 1 (Lebanon). The `MEA_OWN` row is then looked up by the *other* end's zone (`foreignZone`). If chart is `"partner"`, or neither endpoint is Zone 1, or the endpoint's zone has no `MEA_OWN` row, no entry is produced.
- **Seasons:** none — all entries use season `"default"`; no peak/off-peak distinction exists in the file.
- **Cabins:** economy and business are priced (from the `MEA_OWN` `[economy_rt, business_rt]` round-trip pair). premium_economy and first are always `null`.
- **Chart selection:** Only one chart table exists, `MEA_OWN`, keyed by zone number, currently populated with a single row: `{ 5: [35000, 70000] }` (round-trip economy/business points from Beirut to Zone 5 / Europe). No other zone rows are present, so any Zone 1 pairing whose foreign zone is not 5 yields no `ownRow` and no entry.

## Output entries
`handle()` returns an array with at most one entry, built as a literal object (not via `makeEntry`). When produced, it has `programme: "cedarmiles"`, `chart: "own"`, `season: "default"`. Values are fixed (not true ranges): `economy: [e_rt / 2, e_rt / 2]` and `business: [b_rt / 2, b_rt / 2]`, i.e. the round-trip `MEA_OWN` value halved for a one-way price, with both array elements equal. `premium_economy` and `first` are `null`. If no MEA own-metal row applies (partner chart, non-Zone-1 pairing, or missing zone row), `handle()` returns an empty array. The entry's `programme` field is hardcoded as the module id `"cedarmiles"`, which differs in format from the `slug` export `"cedar-miles"`.

## TODO
- [ ] Audit multi-carrier award handling (itineraries with 2+ operating carriers).

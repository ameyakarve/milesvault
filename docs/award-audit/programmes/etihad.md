# Etihad Airways — Etihad Guest

- **Engine module id:** `etihad`
- **KG slug (`slug` export):** `etihad-guest`
- **Airline / IATA:** Etihad Airways (EY)
- **Alliance:** none/unaligned — Etihad is not a member of Star Alliance, oneworld, or SkyTeam; the `BOOKABLE` set is a broad, cross-alliance list of individually-contracted bilateral partners (e.g. AA, AF, KL, NH, SK, SV, ET, GF).
- **File header note:** docblock above `handle()` documenting the per-segment additive model and the two known chart-value residuals (GF/SV partner rates; own-metal business/first in the 1,001–1,500mi band).
- **File size:** ~70 lines

## Bookable carriers
Count: 29. `AA, AC, AD, AF, AT, B6, DE, ET, EY, GA, GF, HU, HX, JU, KL, LY, MH, MU, NH, NZ, OZ, SK, SN, SV, TP, UL, UX, VN, WY`
Own-metal carriers used for chart selection: `EY` (`EY_CARRIERS` set, single member).

## Pricing model
- **Structure:** **per-segment additive.** Each leg is priced independently on its operator's chart — an Etihad-operated (`EY`) segment on the own-metal chart, a partner-operated segment on the partner chart — by *that segment's* distance band, and the segments are summed. It is **not** priced on total O&D distance, and **mixed Etihad+partner itineraries are allowed** (each leg simply uses its operator's chart). Confirmed against live seats.aero award data (economy matches exactly across all-EY and EY+partner routings).
- **Distance bands / zones:** one 10-band distance array (miles) shared by both charts: `ET_BANDS = [500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, Infinity]`.
- **Own vs partner:** decided **per leg** by the leg's operating carrier (`EY_CARRIERS = {EY}` → own chart; anything else → partner chart). No whole-itinerary `resolveChart` classification and no multi-carrier rejection.
- **Seasons:** none — all entries use season `"default"`.
- **Cabins:** own-metal (`ET_OWN`) prices economy/business/first (no premium economy); partner (`ET_PTR`) prices economy/premium_economy/business/first. Premium economy is offered only when **every** segment is partner-operated (own metal has no PE award cabin).
- **Chart selection:** `resolveBand(leg.distance, ET_BANDS)` per leg into `ET_OWN` or `ET_PTR`; cabin totals are summed across legs.

## Output entries
`handle()` returns a single summed entry when carriers are specified — chart `"own"` (all EY), `"partner"` (all partner), or `"mixed"` (both) — with season `"default"` and fixed `[v, v]` cabin values. When no leg carrier is specified (fan-out), it returns two entries: an all-own and an all-partner quote. The `programme` field is set to `"etihad"` (the engine canonicalizes it to the `etihad-guest` slug downstream).

## Partner cabin restrictions
- **No First-class redemption on Saudia (SV), Air France (AF), Oman Air (WY)** (`NO_FIRST_CARRIERS`). If any segment flies one of these, the whole award's `first` is `null`. Confirmed by Etihad Guest sources + KG.

## Verification notes (structure + floors confirmed by running the engine)

Validated the real engine against live seats.aero award data (`scripts/award-eval.mjs`):
economy matched **156/156** exactly. The floors are correct; nothing to fix for floor pricing.

- [x] ~~Own-metal business/first, 1,001–1,500mi band (33k/63k vs 30k/55k)~~ — **not a bug.** Etihad own metal is **dynamically priced**; `ET_OWN` is the Saver **floor** (30k/55k, confirmed vs 10xTravel + KG). The 33k/63k seen on peak dates is dynamic pricing *above* the floor — the floor is what we quote. Economy sat at floor on the same dates.
- [x] ~~Gulf Air (GF) / Saudia (SV) off the standard chart~~ — **no fix.** No special GF/SV chart exists; all partners use the one standard distance-based partner floor, applied per segment. GF looks dynamically priced (fits no fixed band) and is approximated with the partner floor; SV economy can isolate ~3k under on a band, but the dedicated Saudia chart matches ours.
- [ ] **`QP`-coded segments** price as Etihad own metal in live data but `QP` is not in `BOOKABLE`, so production drops those itineraries. Confirm QP's identity before adding it to the bookable set (low priority).

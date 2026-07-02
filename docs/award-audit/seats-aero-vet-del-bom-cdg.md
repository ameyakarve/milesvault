# seats.aero live-availability vet — DEL/BOM → CDG

- **Pulled:** 2026-07-02, seats.aero Partner API (cached search + `/trips` per availability record)
- **Window:** 2027-01-02 → 2027-01-04 (3 days, ~6 months out)
- **Coverage:** 23 availability records → 164 concrete trips vetted through `priceProgramme()` (segments + operating-carrier prefixes from flight numbers; airport `[lat,lng,cc]` from the KG)
- **Result:** 150 OK · 14 flagged (7 unique after dedup across days)
- **Pass rule:** fixed charts must contain the observed cost in some entry's `[min,max]`; floor entries (`floor: true` or `*floor*` chart) pass on `cost ≥ min`; `[0,0]` dynamic sentinels are unvettable.

**No code was changed.** Each finding below includes the in-memory what-if used to characterize it.

---

## 1. Flying Club prices SkyTeam partner awards per LEG, engine prices total distance — CONFIRMED EXACT

| | |
|---|---|
| Trip | BOM–NBO–CDG, both legs KQ, business, **115,000** miles (1 day) |
| Engine | `skyteam_partner` on total distance 6,853 mi → band 8 → J = **100,000** |
| Per-leg | BOM–NBO 2,817 mi → J 40,000; NBO–CDG 4,036 mi → J 75,000; **40,000 + 75,000 = 115,000 — exact match** |

The observed price is exactly the sum of the two per-leg band prices. `programmes/flyingclub/index.js` resolves the ST band once on `totalDistance` (index.js:264-267); the evidence says VS prices each SkyTeam segment separately and sums. Economy would show the same skew (41,000 summed vs 37,000 total-distance). One data point, but an exact hit on two independent band values is hard to explain otherwise.

### Blame (2026-07-02): the per-segment rule was KNOWN and dropped at module authoring

- **2026-02-27** — vault `doubledip/Award Charts/README.md` already lists "Per-segment additive — each flight segment priced separately and summed" as a chart method.
- **2026-03-10** — vault note `Flying Club.md` (backup `b55a5377`) states it explicitly for BOTH VS partner charts: "**Delta charts (distance-based)**: Per-segment additive…" and "**SkyTeam general partner chart**: Per-segment additive — each flight segment is priced individually based on its great circle distance, and the costs are summed." Also: AF/KL short-haul bands use **direct origin→destination distance, not cumulative segment distance**.
- **2026-03-14** — `dd-cf-air-india-award-reqs` commit `37de7fa` (Co-Authored-By: **Claude Opus 4.6**) authored the flyingclub module with `resolveBand(totalDistance, …)` whole-journey banding for the SkyTeam chart (ST), the Delta chart (DL), **and** AF/KL short-haul — contradicting the 4-day-old note on all three counts.
- **2026-06-03** — milesvault `81ae8a7` ported the module verbatim; no later commit touched the ST/DL/AFKL branches (only `a2235a8`, VS own-metal floor flag).
- **2026-07-02** — this seats.aero pull empirically confirms per-segment summing (exact 115,000 match).

So the scope is wider than the KQ observation: three branches in `flyingclub/index.js` mis-model distance —
1. `skyteam_partner` (index.js:264-267): should price per segment and sum, uses `totalDistance`.
2. `delta` (index.js:182-185): same — vault note says per-segment additive.
3. `afkl` short-haul (index.js:216-220): should band on direct O&D distance (a connecting itinerary can be CHEAPER than cumulative distance suggests), uses cumulative `totalDistance` — mispricing in the opposite direction too.

## 2. Etihad Guest: Akasa Air (QP) missing from `BOOKABLE` — 7 trips unpriceable

| | |
|---|---|
| Trips | BOM–AUH on QP + AUH–CDG on EY, economy, 43,000 miles (7 trips across all 3 days) |
| Engine | `ENGINE_NO_ENTRIES` — `QP` not in `programmes/etihad/index.js` BOOKABLE set (index.js:3) |

Akasa Air is an Etihad Guest redemption partner; seats.aero's Etihad feed sells it. Follow-on finding: with QP added in-memory, the engine's `mixed` floor gives Y = **45,000**, while the observed price is **43,000** — the mixed own+partner floor overshoots reality by ~2k on this pairing (would flag as BELOW_MIN). Both the missing carrier and the floor level need a look.

## 3. United MileagePlus: Helvetic (2L) missing from `BOOKABLE` — LX wet-lease segments unpriceable

| | |
|---|---|
| Trips | DEL–ZRH on AI + ZRH–CDG on 2L, economy, 55,000 miles (2 days) |
| Engine | `ENGINE_NO_ENTRIES` — `2L` not in `programmes/united/index.js` BOOKABLE (index.js:27) |

Helvetic operates intra-Europe flying for SWISS; seats.aero reports the operating carrier, so any UA itinerary touching an LX regional segment fails bookability. With 2L added in-memory the trip prices fine (partner floor Y 33,000 ≤ 55,000 observed).

## 4. United MileagePlus: ITA Airways (AZ) missing from `BOOKABLE`

| | |
|---|---|
| Trip | DEL–MXP on AI + LIN–CDG on AZ, economy, 55,000 miles (1 day) |
| Engine | `ENGINE_NO_ENTRIES` — `AZ` not in BOOKABLE (index.js:27) |

United's own feed is selling AZ segments (ITA's Star Alliance/UA partnership post-Lufthansa acquisition). With AZ added in-memory the trip passes (partner floor Y 33,000). Note the itinerary is also a MXP→LIN ground transfer, which the engine handles fine as separate legs.

## 5. Delta SkyMiles: no observed floors for India→Europe partner awards (informational)

| | |
|---|---|
| Trips | DEL/BOM–JED–CDG on SV, Y 35,000 / J 65,000 (3 trips) |
| Engine | `[0,0]` dynamic sentinel — `programmes/delta/index.js` FLOORS has no data for this zone pair |

Not a wrong price — the engine explicitly declines. Observed data points if the floors table is ever seeded: SV-operated IN→EU, Y 35,000, J 65,000.

## 6. Code finding from prep: `flyingblue` floor entries missing `floor: true`

`programmes/flyingblue/index.js:105-108` builds `chart: "dynamic_floor"` entries without the `floor: true` flag that aeroplan/united/delta/aadvantage/flyingclub set. Per `index.d.ts`, the flag is what makes the tier model surface `{from, to: null}`; without it Flying Blue floors present as fixed `[min,max]`. (This vet compensated by treating `*floor*` chart names as floors — Flying Blue trips all passed as floors: 15,000/30,000/50,000 Y/W/J DEL→CDG with observed dynamic prices above.)

---

## What passed (context)

150 trips OK, including: aeroplan partner chart (42,500 Y / 70,000 J via LH/AC connections), flying-blue floors (AF nonstop BOM/DEL–CDG dynamic above floor), turkish-miles-and-smiles, qatar-privilege-club, emirates-skywards, lifemiles, aadvantage, virginatlantic AF-metal, etihad EY-only itineraries, and krisflyer. Unmapped seats.aero sources in this window: none.

## Fixes applied (2026-07-02, same day)

All fixable findings were corrected and re-vetted against the same live pull — **154/164 OK** (was 150):

1. **flyingclub** — `skyteam_partner` and `delta` charts now price per segment and sum (`sumPerLeg`); AF/KL short-haul now bands on **direct** origin→final-destination distance (`directDistance`, coordinates threaded through `resolveLegs` as `origin_lat/lng`, `destination_lat/lng` on `ResolvedLeg`). Verified: KQ BOM–NBO–CDG J = 115,000 (matches observed); single-leg pricing unchanged; NAP→MXP via CDG prices at the 4,000/8,000 tier per the vault note's example.
2. **etihad** — `QP` added to BOOKABLE. All 7 Akasa trips now price.
3. **united** — `2L` and `AZ` added to BOOKABLE. All 3 trips now pass (55,000 ≥ 33,000 partner floor).
4. **flyingblue** — `floor: true` set on `dynamic_floor` entries.

### Remaining flags after re-vet (intentionally not "fixed")

- **BELOW_MIN, etihad mixed QP+EY, Y 43,000 vs floor 45,000 (7 trips).** The engine sums QP-as-partner (15,000) + EY-own (30,000). Observed 43,000 exactly equals QP-at-**own**-rates (13,000) + EY-own (30,000) — hypothesis: Etihad prices Akasa at own-metal rates. One economy data point fits several explanations (band-2 partner floor could also just be 13,000); needs more routes/cabins before touching the floors.
- **DYNAMIC_UNVETTABLE, delta SV itineraries (3 trips).** Engine's explicit no-data sentinel. Not seeded: one carrier on one routing is too thin to establish a zone floor (observed points remain logged above).



- `vet-seats-aero.mjs` — the harness (read-only; API key via env)
- `seats-availability.json` — raw cached-search pull (23 records)
- `vet-results.json` — all 164 per-trip verdicts

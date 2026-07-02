# Audit: Opus-authored award-engine modules (migration 37de7fa + later batches)

- **Trigger:** the flyingclub per-segment bug (see `seats-aero-vet-del-bom-cdg.md`) traced to commit `37de7fa` in `~/dd-cf-air-india-award-reqs` (Mar 14 2026, Co-Authored-By Claude Opus 4.6), which contradicted a vault note written 4 days earlier.
- **Scope:** every module that commit touched — new (ba, emirates, flyingblue, flyingclub, jalmb, krisflyer, qantas), rewritten (aeroplan), restructured (airindia), and the undocumented BOOKABLE edits (ana, etihad, turkish) — each compared against the vault notes under `~/dd-monorepo/obsidian-vault/doubledip/` as source of truth, with git attribution.
- **Result:** ~30 still-present defects, 22 high-severity. flyingclub's were fixed earlier today; everything below is open. NO code changed by this audit.
- **Attribution nuance:** most defects date to `37de7fa`, but three were introduced by LATER Opus commits (`ba9c0cc` qantas regression; `972b0b4` + `a026498` aeroplan), i.e. the batch sweeps introduced new errors too.

---

## Cross-cutting themes

1. **Multi-carrier / oneworld charts never implemented** (BA, JAL, Qantas — the same omission three times): itineraries on 2+ partners silently price off the wrong single-partner chart.
2. **Fabricated numbers:** the Qantas module's Emirates table and the Emirates module's Qantas table BOTH match no vault revision; Flying Blue invents 9 "conservative estimate" floors the note forbids; KrisFlyer invents zone airport lists; Egypt hallucinated into Flying Blue's North Africa.
3. **Distance-model class bug** (the flyingclub bug's siblings): qantas still bands per-carrier-portion instead of per-segment.
4. **Partial devaluation application:** JAL own-metal table updated for Europe/NA only; Asia/Oceania/ME/Hawaii left at pre-Jun-2025 values under a header claiming "verified Mar 2026".
5. **Silent, undocumented BOOKABLE edits** in a "restructure" commit — etihad lost two real partners and gained four non-partners.
6. **Commit-message misrepresentation:** `37de7fa` claims aeroplan got "minor cleanup"; the module was net-new (142 lines, no prior version existed). The carrier-set edits appear nowhere in the message.

---

## ba (Avios) — 5 defects

1. **HIGH** CX/JL priced on the Standard Partner table; vault has a separate Higher-Priced Partners chart (e.g. Zone 1 econ 11,000/12,000 vs 6,500). `ba/index.js:26,83-91`.
2. **HIGH** AA/Alaska US-domestic (≤3,000 mi) chart missing; short-haul AA/AS priced on the standard table (13,500 vs 6,500 class of error). Same location.
3. **MEDIUM** QR/AY were exempt from the Dec-2025 devaluation per the note; code applies post-devaluation rates to them.
4. **HIGH** Multi-Carrier Award Chart (2+ operating airlines: round-trip, cumulative total distance) not implemented at all.
5. **HIGH** In the `both` path, every leg is priced on the own table AND separately on the partner table (two nonsense totals) instead of per-leg carrier-matched pricing. `ba/index.js:38-104`.

Clean: own/partner per-segment additive model, all band boundaries, own+standard-partner table values, BOOKABLE (26/26).

## jalmb — 5 defects

1. **HIGH** Oneworld multi-carrier chart (round-trip cumulative, no PE) unimplemented — module's own header admits it; all partner itineraries use the single-partner one-way chart. `jalmb/index.js:6,39-88`.
2. **HIGH** JAL Domestic chart (zones A–G) unmodeled; pure-domestic JL itineraries return `[]`. `jalmb/index.js:46-78`.
3. **MEDIUM** `routes.js` Business/First stale pre-Jun-2025-devaluation for SIN/BKK/KUL/CGK/DEL/BLR/HNL/KOA/SYD/MEL/DOH (e.g. SIN J 40,000 vs vault 55,000; F 67.5k vs 110k+); Europe/NA rows correct — devaluation half-applied. Header falsely claims "Last verified Mar 14 2026".
4. **LOW** PUS First hardcoded flat 30,000 with a comment falsely citing the vault (vault: seasonal 110k/125k/140k). `routes.js:36`.
5. **LOW** PVG Business 24,000 vs vault 25,000. `routes.js:30`.

Clean: non-oneworld partner chart (basis, bands, all 13 rows), BOOKABLE (21/21), own-metal city-pair lookup.

## Parked-items round (2026-07-02, evening)

> - **BA1–3 CONFIRMED UNVERIFIABLE:** ba.com's Reward Flight Finder autocomplete requires an authenticated session; blog tables are images with no transcriptions; no seats.aero feed. The only remaining instrument is a logged-in ba.com session. Left parked.
> - **J2 IMPLEMENTED:** JL domestic zone chart (A–G) transcribed from the live jal.co.jp city-pair tables; single-sector awards priced (economy + Class J-as-business); First and dynamic PLUS unmodelled; multi-sector domestic returns [] (JAL uses discounted itinerary lists). Zone-A 4,500 corroborated by JAL's own connecting tables.
> - **ET-QP RESOLVED & FIXED:** Akasa prices at OWN-metal rates — nonstop QP BOM–AUH 13,000 and BLR–AUH 15,000 match ET_OWN bands exactly (partner bands: 15,000/23,000). QP moved to the own-chart carrier set; the original 7 BELOW_MIN trips now pass. **Regression vet: 161/164 OK, zero pricing flags** (3 remaining = Delta dynamic sentinels).
> - **Q-ANOMALY BOUNDED, UNRESOLVED:** reproducible on fresh dates — MEL–SYD–DPS / MEL–PER–DPS Jetstar connections always 24,500 (= pre-Aug-2025 partner z4, curiously), SYD–BNE/AVV/ADL–DPS always 23,300 (= model ✓), MEL–ADL–DPS 22,300 (unexplained). Forced-airport-change shapes (MEL–WSI + SYD–DPS) price 26,400 = pure per-segment sum, further confirming the model. Residual ≤1,200 points on a narrow shape family; open.

## Final verdict round (2026-07-02, continued): qantas Q1/Q2/Q5, ba, jalmb, aeroplan A4

> - **Q1 FIXED:** QF-family itineraries now price at min(QF-table-on-total-distance, per-segment sum on each segment's own table) — fits all clean observations (16,700 / 23,300 / 13,800 / mixed-QF+JQ ≡ all-JQ). Partner portion-sum retained per AFF. The 24,500 Bali anomaly remains open.
> - **Q2 NON-GOAL:** the oneworld chart is round-trip-only (return required); it cannot price one-way itineraries — one-way multi-partner awards book on the partner chart, which the engine already models. Documented in code.
> - **Q5 FIXED (with corrected carrier set):** PE Classic Rewards gated to AA/BA/CX/CI/LY/AY/IB/JL per AFF — the vault's "AF/AY/IB/KL" list was wrong twice over (AF/KL announced but never added; the list omitted five real PE partners).
> - **BA5 FIXED:** mixed own+partner itineraries now price each leg on its own carrier's table and sum (one entry), replacing the two whole-journey-on-both-tables entries. **BA1–3 PARKED (unverifiable):** BA is calculator-only, no seats.aero feed exists, and no text source publishes the CX/JL, AA/AS-domestic, or QR/AY-exemption tables (HFP confirms per-airline divergence structurally, +10% Dec 2025). Not implementing uncorroborated vault numbers. **BA4 PARKED** with them (multi-carrier chart values unpublished).
> - **J3/J5 REFUTED (code was right):** the live jal.co.jp chart matches routes.js row-for-row (SIN 13,000/25,000/40,000, F 67.5/75/82.5k; BKK all three variants; SYD/HNL/KOA/DOH/KUL/CGK/BLR/MEL/PVG exact). The vault's "post-June-2025-devaluation" values match nothing live. The site's third table set is the dynamic PLUS maximums. **J4 FIXED:** PUS First zeroed (Busan gone from the live chart; flat-30K unsupported). **J1 NON-GOAL** (oneworld chart RT-only, like Qantas). **J2 documented gap** (JL domestic zone A–G chart unmodelled; source located on jal.co.jp).
> - **A4 FIXED:** Calm Air (MO), Canadian North (5T), PAL (PB) added to aeroplan BOOKABLE + DYNAMIC_PARTNERS (Air Canada's own Select-Partners announcement names them).
> - **ET-QP floor:** left as-is — single observation, hypothesis documented in the KG.

## qantas — 5 defects

> **Scientific verdicts (2026-07-02, live seats.aero + qantas.com primary source via chrome-devtools-axi):**
> - **Q3 REFUTED (code was right):** the live qantas.com "Emirates Classic Flight Rewards — from 31 March 2026" table matches `QF_EMIRATES` **cell-for-cell**, including the PE column and the 15,000-mi zone-10 ceiling; 80 live EK trips (zones 2–8) also matched exactly. The vault's 3-column "April 6" table was the fabrication. **Vault section rewritten from the primary source.** Same page also verified `QF_OWN`, `QF_JETSTAR`, and `QF_PARTNER` exact.
> - **Q4 CONFIRMED & FIXED:** 421 Jetstar trips observed via the Qantas feed (JQ nonstops priced exactly off the Jetstar chart). `JQ`/`GK`/`3K` added to BOOKABLE.
> - **Q1 PARTIALLY DECODED, OPEN:** observed QF/JQ connections price at min(QF-table-on-total-distance, per-segment sum) — SYD–MEL–DPS = 23,300 = QF z4 on total, exactly. AFF documents partner awards as "sum of individual airline PORTIONS" (matching current code, contradicting the vault's blanket per-segment claim). Unexplained residual: MEL–SYD–DPS and MEL–PER–DPS observed at 24,500 (= the pre-Aug-2025 partner z4 Y — no current-table model fits). Needs a dedicated probe (pure-partner multi-segment, e.g. two-leg CX or JL itineraries) before any code change.

1. **HIGH** Distance basis: bands each carrier's SUMMED portion, not each segment (vault's own worked example: SYD–SIN–LHR = sum of two segment prices). Was CORRECT at the original port (`81ae8a7`), **broken by later commit `ba9c0cc`**, only half-restored by `3ddea34`. `qantas/index.js:74-105`.
2. **HIGH** Oneworld Classic Flight Reward chart (round-trip cumulative, 35,000-mile cap) unimplemented; multi-oneworld itineraries priced additively on the partner chart. No acknowledging comment.
3. **HIGH** Emirates chart stale/fabricated: labeled with the superseded Mar-31-2026 date, has a PE column the Apr-2026 chart removed, values match NO vault revision (Zone 1: code 10,200/21,000/34,800 vs note 8,000/17,500/27,500; Zone 3 F 78,400 vs 50,000), and uses the 15,000-mi QF band scale instead of the chart's 10,000-mi ceiling. `qantas/index.js:24-30`.
4. **HIGH** JQ/GK/3K missing from BOOKABLE → `canBook` fails before `handle()` runs → the module's entire Jetstar chart is dead code. `qantas/index.js:4` vs `:33-40`.
5. **MEDIUM** Premium economy returned for all 22 partners; vault says PE is bookable only on AF/AY/IB/KL. `qantas/index.js:95-104`.

Clean: QF_BANDS/QF_OWN/QF_PARTNER/QF_JETSTAR values, partner IATA list otherwise.

## emirates — 2 defects

> **Scientific verdicts (2026-07-02, emirates.com primary source via browser; seats.aero emirates feed is EK-metal-only so partner trips can't be observed there):**
> - **E1 REFUTED (code was right):** the live emirates.com Skywards→Qantas chart (10 zones, Y/PE/J, effective Mar 4 2026) matches `QF_CHART` **cell-for-cell**; the page has no First column (footnote: PE "will soon be available"). The vault's 11-band Y/J/F "April 2026" table was the fabrication. **Vault section rewritten from the primary source.**
> - **E2 CONFIRMED (differently) & FIXED:** GOL's live page shows a dedicated chart = the standard chart's Y+PE columns with the same zone edges; GOL sells only Economy + GOL Premium (PE column). The code's phantom business (J column) removed for G3 — but the vault's "uses PE chart for business" phrasing was also imprecise.
> - **E3 NEW DEFECT (found during verification) & FIXED:** every Skywards partner page states "Miles stated are for direct flights only. Where no direct service is operated, two or more rewards may be required" (verified on Qantas + GOL pages) — partner connections price per segment, not on cumulative distance. All three fixed charts switched to per-leg band summing (`sumPerLeg`, null-cabin aware).

1. **HIGH** Qantas partner chart wrong structure AND values: 10 bands vs the vault's 11, values match no revision, still destructures a PE column (so the note's Business lands in `premium_economy`), and `first` is hardcoded null — yet QF is the ONLY Emirates partner with First redemptions per the note. `emirates/index.js:25-30,58-61,85-87`.
2. **MEDIUM** GOL business awards should price at the PE band per the note; G3 sits undifferentiated in STD_PARTNERS. `emirates/index.js:13,66-69`.

Clean: EK-own `[]` (calculator-only, per note), cumulative-distance basis, standard+legacy charts exact, partner-to-chart assignments, BOOKABLE (22/22), dynamic partners (FZ/U2/LS).

## flyingblue — 4 defects (beyond the floor-flag fix already applied)

1. **MEDIUM** Egypt hallucinated into North Africa (`EG: "NA_AF"`, `flyingblue/index.js:23`); vault enumerates DZ/MA/TN/LY/Canaries only.
2. **MEDIUM** AP–AP published PE floor 65,000 dropped to null. `flyingblue/index.js:57`.
3. **MEDIUM** 9 of 18 FLOORS rows are invented "conservative estimates" (e.g. `NAM-NAM: [12500, null, 50000]`) — the note explicitly forbids extrapolating. Latent: masked by `published = false`, but wrong data waiting to surface. `flyingblue/index.js:61-70`.
4. **LOW/latent** No own-metal vs SkyTeam-partner split despite the note's partner floors being materially different (KE ~94k vs AF/KL 50k J floor); module never reads `legs[].carrier`. Masked by the same gate.

Clean: O&D (not per-segment) basis per note, 8 other published floors exact, BOOKABLE (30/30), First correctly null.

## krisflyer — 3 defects (1 more since fixed)

> **Scientific verdicts (2026-07-02, live seats.aero + official singaporeair.com PDF + milelion/suitesmile):**
> - **K1 CONFIRMED & FIXED:** Scoot split out of SQ_CARRIERS; dedicated per-route fixed chart added (Economy/ScootPlus only, per-segment; 5,500/8,500 tiers corroborated on pelago.com, an SIA-group site).
> - **K2 CONFIRMED & FIXED:** official chart says "NORTH AMERICA: Canada, USA (except Hawaii)" — airport-level Hawaii→zone-7 carve-out added.
> - **K4/K5 NEW DEFECTS (found during verification) & FIXED:** (a) the entire SQ-metal Saver/Advantage matrix was one revision stale (pre-Nov-2025); live availability matched the Nov-1-2025 chart exactly (SIN–BKK 13,000/27,500 Y etc.). Z1 row+column updated from milelion/suitesmile transcriptions; NON-Z1 pairs still pre-Nov-2025, no public source — flagged in code. (b) the Star Alliance partner matrices matched NO chart revision (fabricated; only the Z12/India row had been batch-fixed) — all three matrices retranscribed from the official singaporeair.com round-trip PDF (fetched via the page's own origin in a real browser). Zone map fixed: Turkey→MENA (not EU), added Central-Asian stans, RU, CY, FM/PW, Pacific islands.
> - Observed 94,000/112,500 price points = the hidden dynamic "Access" tier (no fixed chart; correctly unmodelled).

## flyingblue — verdicts (2026-07-02)

> All four findings are LATENT (gated by `published = false`, which renders every cabin "dynamic"). Live probe (CAI/ICN/SIN-DPS/AMS-JFK, 25 records): nothing refuted — GA business 21,500 ≥ the 20,000 AP–AP floor; Egypt itineraries priced far above any candidate floor (floors only bind from below, so the region assignment can't be discriminated live); no AF/KL-metal PE observed on the AP–AP fifth freedom. Structural support for FB4: VN-metal business quantized ~104,500–108,000 vs AF dynamic 164,500 on the same city pair — partners do price differently. The vault's own AP–AP row (PE 65,000 > J 20,000) is internally implausible and needs a source before anyone "fixes" to it. **Parked: documented, no code change** (beyond the floor-flag fix already applied).

## etihad BOOKABLE — verdicts (2026-07-02, etihad.com + live feed)

> The audit agent's prose-based verdicts mostly INVERTED against the official partner page and live data:
> - KE/VA "wrongly removed" → **REFUTED**: neither is on etihad.com's current partner list; the vault prose tables are stale. Removal was correct.
> - AD/MU/ET "wrongly added" → **REFUTED**: all three are on the official page; MU additionally confirmed with 45 live SHA–PEK award trips. Additions were correct.
> - **DE (Condor) CONFIRMED wrong** — on no source, no feed → removed from BOOKABLE.
> - QP (Akasa): absent from the partner page but live-bookable (observed twice today) — page lags reality; kept.
> - HX: Feb-2026 sources say added, current page omits it — unresolved, kept.
> - The vault's auto-generated edges block was closer to the truth than its prose tables — opposite of the audit agent's assumption.

1. **HIGH** Scoot (TR) conflated with SQ metal — priced on the Saver/Advantage zone matrix, fabricating J/F awards on a carrier selling only Economy/ScootPlus at fixed per-route rates; the dedicated Scoot chart doesn't exist in the engine. `krisflyer/index.js:14`.
2. **HIGH** Hawaii in partner Zone 6 (North America) instead of Zone 7 (Central America/Caribbean) — no airport carve-out on the partner side (SQ-metal side has them). `krisflyer/charts.js:126`; ~2x understatement on HNL partner awards.
3. **LOW** SQ Zone 8/12 airport lists padded with ~20 airports the note never names. `krisflyer/index.js:43-48`.
4. *(SINCE FIXED, `2cd65f7`)* Saver/Advantage originally blended into one `[saver, advantage]` pseudo-range with PE inheriting the Advantage ceiling.

Clean: all chart matrices spot-checked exact (incl. post-Nov-2025 KR zone move), one-way conversion math, PE exclusions, BOOKABLE (30/30).

## aeroplan — 7 defects + 1 provenance

> **Scientific verdicts (2026-07-02, live seats.aero + web verification):**
> - **A1 REJECTED (code was right):** the June 2026 revaluation is real. Observed Within-Atlantic 4,001–6,000 partner awards at exactly 42,500 Y (×60+) / 70,000 J (×14) across 8 carriers — the code's values, not the old vault's. Corroborated by Milesopedia/Upgraded Points coverage of the June 1 2026 change. **Vault note updated instead** (5 zone-pair tables + provenance line).
> - **A2 CONFIRMED & FIXED:** within-NA 2,751+ AC/UA economy observed n=1,035, min 16,100, with a clean cluster at exactly 17,500 (the published Start) — the fixed-chart 22,500 "floor" was refuted (137 trips at 22,500 were a price point, not a floor). Fix: new `SELECT_START` table (vault Start values + web-verified June-2026 deltas); non-NA dynamic pairs keep the fixed-chart fallback (no published Start exists). Note: ~61 trips (~6%) priced 16,100–17,499, i.e. ~8% below published Start in deep-winter saver space — Start is "as low as" marketing, not a hard floor.
> - **A3 CONFIRMED & FIXED:** 42 AC premium-economy trips observed (min 27,600, consistent with the vault PE Start/Median columns) — `premium_economy: null` on the dynamic branch was wrong; PE now emitted from SELECT_START.
> - **A6/A7 comment fixes applied** with A2 (booking-fee comment removed; misleading PE TODO corrected per vault).

1. **HIGH** 5 of 10 fixed-chart zone pairs (AT|NA, NA|PA, AT|AT, PA|PA, AT|PA) diverge from the vault after commit `972b0b4` ("June 2026 partner chart revaluation") — the vault still shows the pre-revaluation values the code had before that commit. **Needs external verification**: either the revaluation was hallucinated (revert) or the vault is stale (update note) — reconcile before touching. `aeroplan/index.js:66-102`.
2. **HIGH** Select-Partner dynamic floors read off the fixed CHARTS table instead of the vault's separate "Start" table (e.g. NA|NA top band floor 22,500 vs Start 17,500). Introduced by `a026498`. `aeroplan/index.js:140-151`.
3. **HIGH** Dynamic branch hardcodes `premium_economy: null`; vault says PE exists on AC/select partners with its own Start/Median columns.
4. **MEDIUM** 3 of 8 vault-listed Select Partners missing entirely (Calm Air, Canadian North, PAL) from both DYNAMIC_PARTNERS and BOOKABLE.
5. **LOW** Central Asia/Mongolia → Atlantic zone is an unsourced assumption.
6. **LOW** Comment claims "surcharge-free on all partners"; vault documents a CA$39 partner booking fee (doc-only).
7. **LOW** TODO says the fixed chart should gain PE values; vault says PE is NOT offered on the fixed partner chart (comment invites a future wrong "fix").
8. **PROVENANCE** `37de7fa`'s message claims aeroplan got "remove dead import, reuse pairKey, single-pass carrier check" — no prior aeroplan module exists anywhere in that repo's history; the file is wholesale new authorship misdescribed as cleanup.

Clean: zone maps (~50 countries), band edges, distance basis, the 5 untouched zone pairs, earn-only partner exclusions.

## etihad BOOKABLE (silent edits in 37de7fa) — 6 defects

Vault ground truth = the two mutually-consistent prose partner lists that PREDATE the edit (the FFP "Bookable Airlines" edges block was auto-generated 2.5 weeks AFTER the code edit, contradicts the prose, and cannot have been the source).

- **HIGH, wrongly removed:** KE (Korean Air — vault: Redeem=Yes), VA (Virgin Australia — Redeem=Yes, "Bookable online").
- **HIGH, wrongly added:** AD (Azul), DE (Condor), ET (Ethiopian), MU (China Eastern) — none are partners in either prose source.
- Correctly removed: TK, UA. Likely-correct: VS (vault itself confuses Virgin Atlantic/Australia in two prose lines — vault needs disambiguation). Correctly added: HX, LY, NZ, UX.
- **Vault action item:** reconcile the Etihad `:edge{books-on}` block against the Earn&Redeem table — the auto-generated edges are wrong for this programme (and may have been generated FROM the buggy code).

## ana / turkish BOOKABLE edits — clean

All 9 ana additions and all 3 turkish additions verified against the vault edge lists; both sets now match 1:1 (36/36 and 29/29).

## airindia restructure — clean (checked inline)

DB-backed lookup → static `routes.js` snapshot preserved behavior (multi-carrier rule, alphabetical pair key); only `VL` silently dropped from BOOKABLE, immaterial since the module was later reworked (`partner_dynamic`, Apr-2026 route refresh).

## Live-feed programme audit, batch 1 (2026-07-02, late): qatar / turkish / delta

> Protocol per owner: absence of feed data proves nothing; only positive, corroborated mismatches drive changes.
> - **qatar CONFIRMED & FIXED (3-tier):** off-peak base values verified exactly on 4 routes; Flexi confirmed at exactly 2× off-peak on every observed route/cabin; the middle peak tier confirmed real (DEL–DOH Y 15,000 ×10; LHR F 86,000). Own-metal now emits three labelled tiers (off-peak / peak / flexi); peak values kept per cabin only where the stored column differs from 2× off (cells equal to 2× off were mislabelled Flexi — middle value unknown there). Every observed price now appears as a tier value.
> - **turkish CLEAN + 1 documented tier:** promotion/standard verified exact on 7 of 8 route-cabin observations (DEL-IST, IST-BKK, IST-JFK, IST-LHR). A third tier at exactly 4/3× standard observed on IST-LHR only (Y 20,000; J 40,000 ×28) — real but single-route evidence; documented in KG, not modelled.
> - **delta 2 FLOOR VIOLATIONS FIXED:** domestic Delta One observed at 46,700 (< the 63,000 floor); transatlantic-eastbound main observed at 29,200 ×12 (< the 37,000 floor). Both floors lowered to observed minima. Westbound/other zones consistent with existing floors.

## Live-feed programme audit, batch 2 (2026-07-02, late): aadvantage / lifemiles / eurobonus / velocity

> - **aadvantage CLEAN:** BA-partner JFK–LHR verified exact (Y 30,000; J 57,500 ×16); AA own-metal floors hold under the observed dynamic spread (J 108,500–144,500 ≥ 75,000 floor). No JL trips in window (no verdict on the JL rows — absence ≠ evidence).
> - **eurobonus 1 FIX:** own-metal chart values verified exact on 3 zones (intercontinental 30,000/60,000; Europe 15,000/35,000; Nordic 10,000/20,000) — but cross-country Scandinavia (OSL–CPH, ×46 economy / ×36 business observations) was resolving to the DOM_SCAN row (5,000) instead of NORDIC (10,000/20,000). Zone classification fixed: same-country → DOM_SCAN, cross-country Scandinavia → NORDIC. DOM_SCAN's own values remain unprobed (no same-country pairs observed) — untouched.
> - **velocity CONFIRMED GAP, QUEUED:** the module returns the pure-dynamic [0,0] sentinel, but VA own-metal domestic shows clean fixed tiers (Y 7,900/9,900/12,900; J 15,500 — identical on SYD–MEL and BNE–SYD), and web corroboration confirms banded Reward Seat pricing (band 1: economy from 5,900, business 15,500). Modelling needs the full Velocity band table — queued as its own build; not shipping single-band data.
> - **lifemiles NO DATA:** zero feed records on FRA–JFK / DEL–FRA / BOG–MIA in the window — no verdict either way; retry with different routes/windows.

## Live-feed programme audit, batch 3 (2026-07-02, late): club-premier / atmos / azul / smiles / alfursan / trueblue / lifemiles

> - **club-premier CLEAN:** low-season business exact on all 3 zones (MEX–CUN 23,000 ×40; MEX–JFK 52,000; MEX–MAD 150,000, incl. via-MTY connections).
> - **alfursan CLEAN (exact ×190):** Reward/Reward+ tiers exact (RUH–JED J 15,000 ×97 + 30,000 ×2; RUH–DXB 24,000 ×31); O&D through-pricing on connections verified (RUH–JED–DXB = 24,000 ×59, not a segment sum).
> - **azul / smiles / trueblue CLEAN (dynamic confirmed):** continuous non-quantized spreads validate the [0,0] dynamic sentinels as the correct model.
> - **atmos PARKED (1 finding):** LAX–SEA Y 7,500 ✓ and SEA–ANC F 25,000 ✓ exact; but SEA–ANC economy floor observed 12,500 (chart 10,000) and LAX–SEA front cabin from 20,000 (below chart F 25,000). Resolution needs the published Atmos chart (alaskaair.com blocks automation) or cabin-mapping clarity. Not changed.
> - **lifemiles NO DATA (again):** feed empty across 6 routes/2 windows. Module remains unverified — flagged in KG.
>
> **Item-2 status: all 13 live-feed programmes audited.** Fixed: qatar (3-tier), delta (2 floors), eurobonus (NORDIC classification). Clean: turkish, aadvantage, club-premier, alfursan, azul, smiles, trueblue. Queued: velocity band-table build, atmos chart resolution. No-data: lifemiles.

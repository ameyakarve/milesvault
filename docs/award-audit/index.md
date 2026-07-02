# Airline Award-Fares Engine — Audit

> Baseline documentation for MilesVault's award-pricing engine. One index (this
> file) + one logic doc per supported programme under
> [`programmes/`](./programmes/). Everything here describes the code **as it is
> today** so the audit run has a fixed reference to check against.

## What this tool is

Given an origin + destination, the award tool finds every nonstop and one-stop
routing and prices **every loyalty programme that can actually book that
routing** through its real published award chart. It is deliberately
**card-agnostic**: it answers "what does this flight cost in miles, in each
programme's own currency?" — accumulation, transfers, and costing in the user's
own points live elsewhere (the `/points` page + `TRANSFERS` / `EARNS_INTO`
graph). Keeping the fly-side objective and generic is the whole design.

## Where the code lives

| Piece | Path |
|---|---|
| Engine core (resolve, price, fan-out) | `src/durable/agents/tools/concierge/award-engine/index.js` |
| Shared helpers (haversine, bands, charts) | `src/durable/agents/tools/concierge/award-engine/shared.js` |
| Type boundary | `src/durable/agents/tools/concierge/award-engine/index.d.ts` |
| Per-programme modules (46) | `src/durable/agents/tools/concierge/award-engine/programmes/<id>/index.js` |
| Airport table (lat/lng/cc) | `src/durable/agents/tools/concierge/award-engine/airports.ts` |
| Tool wrapper / result shape | `src/durable/agents/tools/concierge/award-options.ts` |
| Routing generation | `src/durable/agents/tools/concierge/flight-routings.ts` |
| Explore / plan / show surfaces | `award-explore.ts`, `award-plan.ts`, `show-award-options.ts` |

## Architecture & data flow

1. **Routing** — `computeRoutings(o, d)` produces candidate nonstop + one-stop
   routings, each leg carrying its operating carrier IATA(s).
2. **Leg resolution** — `resolveLegs` looks each airport up in the injected
   airport table → `[lat, lng, countryCode]`, and computes great-circle
   distance via `haversine` (nm × 1.15078 → statute miles, rounded).
3. **Bookability filter** — for each programme, `canBook` requires **every** leg
   carrier to be in the module's `bookable` Set. Programmes that can't ticket the
   routing are skipped.
4. **Own-metal preference** — per leg, the wrapper picks a bookable carrier,
   preferring the programme's own metal (resolved via the KG `OWN_METAL` edge).
5. **Pricing** — `priceProgramme(id, legs)` calls the module's
   `handle(legs, totalDistance)`, which returns one or more **entries**. Each
   entry is `{ programme, chart, season, economy, premium_economy, business,
   first }`, where every cabin is `[min,max]` miles or `null`.
6. **Aggregation** (`aggregateCabins`) — merges a programme's entries into one
   per-cabin cell, taking the min/max envelope across seasons/charts. **A chart
   figure of `0` is not a real price** — it collapses to `"dynamic"` ("varies,
   confirm live") rather than a misleading zero.
7. **Published flag** — a module may `export const published = false` to force
   every offered cabin to `"dynamic"`. Absent the flag, the programme is treated
   as chart-priced.
8. **Grouping & sort** — interchangeable routings (same programme, stops, metal,
   identical cabins) collapse into one option; directs first, then shorter
   distance, own-metal, stable programme order. Capped at 80 options.

## Engine contract (per programme module)

Each `programmes/<id>/index.js` exports:

- `slug` — the milesvault-kg programme slug. **This is the canonical id** the
  engine keys `PROGRAMMES` by; the directory name is only an internal handle and
  often differs (e.g. dir `ba` → slug `avios`). The engine canonicalizes every
  entry's `programme` field to this slug.
- `bookable` — `Set<string>` of operating-carrier IATA codes the programme can
  ticket (own metal + partners).
- `handle(legs, totalDistance) → Entry[]` — the pricing function.
- optionally `published = false` — see step 7 above.

## Logic taxonomy

Programmes fall into a handful of structural styles (per-programme docs classify
each precisely):

- **Distance-band, per-segment additive** — sum a band cost per leg (e.g. Avios).
- **Distance-band, whole-journey** — single band on total distance.
- **Zone-pair** — map origin/dest country → zone, look up a zone-pair chart
  (e.g. LifeMiles).
- **Region-pair** — coarser continent/region chart.
- **Fixed chart** — flat published figures independent of distance.
- **Fully dynamic placeholder** — no published chart; emits `[0,0]` / sets
  `published=false` so the cabin surfaces as "varies" (e.g. Velocity).
- **Hybrid / own-vs-partner split** — different charts for own metal vs
  partners, often chosen via `resolveChart` or a carrier-set check.

## Supported programmes (46)

Directory id → KG slug is the identity mapping; **the slug is canonical**.
Airline/alliance below are the starting reference — the per-programme docs are
authoritative and flag any staleness.

| # | Module id | KG slug | Airline (IATA) | Alliance | Doc |
|---|---|---|---|---|---|
| 1 | `aadvantage` | `aadvantage` | American Airlines (AA) | oneworld | [→](./programmes/aadvantage.md) |
| 2 | `aeroplan` | `aeroplan` | Air Canada (AC) | Star Alliance | [→](./programmes/aeroplan.md) |
| 3 | `airindia` | `maharaja-club` | Air India (AI) | Star Alliance | [→](./programmes/airindia.md) |
| 4 | `alfursan` | `alfursan` | Saudia (SV) | SkyTeam | [→](./programmes/alfursan.md) |
| 5 | `ana` | `ana-mileage-club` | ANA (NH) | Star Alliance | [→](./programmes/ana.md) |
| 6 | `asiamiles` | `asia-miles` | Cathay Pacific (CX) | oneworld | [→](./programmes/asiamiles.md) |
| 7 | `atmos` | `atmos-rewards` | Alaska Airlines (AS) [+HA own] | oneworld | [→](./programmes/atmos.md) |
| 8 | `ba` | `avios` | British Airways (BA) | oneworld | [→](./programmes/ba.md) |
| 9 | `cedarmiles` | `cedar-miles` | Middle East Airlines (ME) | SkyTeam | [→](./programmes/cedarmiles.md) |
| 10 | `clubpremier` | `club-premier` | Aeroméxico (AM) | SkyTeam | [→](./programmes/clubpremier.md) |
| 11 | `connectmiles` | `connectmiles` | Copa (CM) | Star Alliance | [→](./programmes/connectmiles.md) |
| 12 | `cosmile` | `cosmile` | STARLUX (JX) | none | [→](./programmes/cosmile.md) |
| 13 | `delta` | `delta-skymiles` | Delta (DL) | SkyTeam | [→](./programmes/delta.md) |
| 14 | `dynastyflyer` | `dynasty-flyer` | China Airlines (CI) | SkyTeam | [→](./programmes/dynastyflyer.md) |
| 15 | `easternmiles` | `eastern-miles` | China Eastern (MU) | SkyTeam | [→](./programmes/easternmiles.md) |
| 16 | `egretclub` | `egret-club` | Xiamen Airlines (MF) | SkyTeam | [→](./programmes/egretclub.md) |
| 17 | `emirates` | `emirates-skywards` | Emirates (EK) | none | [→](./programmes/emirates.md) |
| 18 | `enrich` | `enrich` | Malaysia Airlines (MH) | oneworld | [→](./programmes/enrich.md) |
| 19 | `etihad` | `etihad-guest` | Etihad (EY) | none | [→](./programmes/etihad.md) |
| 20 | `eurobonus` | `eurobonus` | SAS (SK) | SkyTeam (moved from Star) | [→](./programmes/eurobonus.md) |
| 21 | `eva` | `infinity-mileagelands` | EVA Air (BR) | Star Alliance | [→](./programmes/eva.md) |
| 22 | `finnair` | `finnair-plus` | Finnair (AY) | oneworld | [→](./programmes/finnair.md) |
| 23 | `flyingblue` | `flying-blue` | Air France / KLM (AF/KL) | SkyTeam | [→](./programmes/flyingblue.md) |
| 24 | `flyingclub` | `flying-club` | Virgin Atlantic (VS) | none | [→](./programmes/flyingclub.md) |
| 25 | `flysmiles` | `flysmiles` | SriLankan (UL) | oneworld | [→](./programmes/flysmiles.md) |
| 26 | `iberia` | `iberia-plus` | Iberia (IB) | oneworld | [→](./programmes/iberia.md) |
| 27 | `jalmb` | `jal-mileage-bank` | Japan Airlines (JL) | oneworld | [→](./programmes/jalmb.md) |
| 28 | `krisflyer` | `krisflyer` | Singapore Airlines (SQ) | Star Alliance | [→](./programmes/krisflyer.md) |
| 29 | `latampass` | `latam-pass` | LATAM (LA) | none | [→](./programmes/latampass.md) |
| 30 | `lifemiles` | `lifemiles` | Avianca (AV) | Star Alliance | [→](./programmes/lifemiles.md) |
| 31 | `lotusmiles` | `lotusmiles` | Vietnam Airlines (VN) | SkyTeam | [→](./programmes/lotusmiles.md) |
| 32 | `mabuhay` | `mabuhay-miles` | Philippine Airlines (PR) | none | [→](./programmes/mabuhay.md) |
| 33 | `milesbonus` | `miles-and-bonus` | Aegean (A3) | Star Alliance | [→](./programmes/milesbonus.md) |
| 34 | `milesgo` | `miles-and-go` | TAP Air Portugal (TP) | Star Alliance | [→](./programmes/milesgo.md) |
| 35 | `milesmore` | `miles-and-more` | Lufthansa (LH) | Star Alliance | [→](./programmes/milesmore.md) |
| 36 | `phoenixmiles` | `phoenixmiles` | Air China (CA) | Star Alliance | [→](./programmes/phoenixmiles.md) |
| 37 | `qantas` | `qantas-frequent-flyer` | Qantas (QF) | oneworld | [→](./programmes/qantas.md) |
| 38 | `qatar` | `qatar-privilege-club` | Qatar Airways (QR) | oneworld | [→](./programmes/qatar.md) |
| 39 | `royalorchid` | `royal-orchid-plus` | Thai Airways (TG) | Star Alliance | [→](./programmes/royalorchid.md) |
| 40 | `shebamiles` | `shebamiles` | Ethiopian (ET) | Star Alliance | [→](./programmes/shebamiles.md) |
| 41 | `shenzhen` | `shenzhen-phoenix-miles` | Shenzhen Airlines (ZH) | Star Alliance | [→](./programmes/shenzhen.md) |
| 42 | `sindbad` | `sindbad` | Oman Air (WY) | none/unaligned | [→](./programmes/sindbad.md) |
| 43 | `skypass` | `skypass` | Korean Air (KE) | SkyTeam | [→](./programmes/skypass.md) |
| 44 | `turkish` | `turkish-miles-and-smiles` | Turkish Airlines (TK) | Star Alliance | [→](./programmes/turkish.md) |
| 45 | `united` | `united-mileageplus` | United (UA) | Star Alliance | [→](./programmes/united.md) |
| 46 | `velocity` | `velocity-frequent-flyer` | Virgin Australia (VA) | none | [→](./programmes/velocity.md) |

> **Data hygiene:** every example in these docs must use synthetic, invented
> O&D pairs and illustrative numbers — never the owner's real routes, dates, or
> balances. Chart figures quoted from the modules are public award-chart data.

---

_Status: all 46 per-programme logic docs generated in
[`programmes/`](./programmes/), each capturing that programme's pricing logic._

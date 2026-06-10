import type { AirportLookup } from './award-engine'
import type { KbHttp } from './kb-tools'
import { computeAwardOptions } from './award-options'
import { buildAwardPlan, type AwardPlanRow } from './award-plan'
import { transferGraph, type TransferCell } from './transfer-graph'
import { resolveByBeancountName } from './kb-tools'
import type { BalanceRow } from './points-paths'

// The data layer for the fluid award EXPLORER page. Primary inputs are the city
// pair (+ an optional funding source); everything else — cabin, airline
// include/exclude, stops — is a CLIENT-side filter over this one result set.
//
// It always returns a uniform `rows` shape (AwardPlanRow):
//   - with a `source`  → fully costed in that card's points (delegates to
//     buildAwardPlan: every routing × programme × cabin, joined against the
//     transfers graph, with the path per row).
//   - without a source → the same rows but cost/transfer fields blanked; the
//     table shows the programme's own miles only. In this branch the user's
//     ledger holdings are overlaid: each row gets an `afford` annotation
//     indicating whether they can book it directly ('hold') or after a
//     transfer ('transfer'), or null if neither.
// Plus `airlines`: the distinct operating carriers across all routings (names
// from the KB) for the include/exclude filter.

type Cabin = 'economy' | 'premium_economy' | 'business' | 'first'
const CABINS: Cabin[] = ['economy', 'premium_economy', 'business', 'first']

export type ExploreAirline = { iata: string; name: string }

// Per-cabin affordability annotation on no-source explore rows.
// tier 'hold'     — the user holds the programme currency itself, balance >= miles_min.
// tier 'transfer' — the user holds a feeder currency that transfers in cheaply enough.
// src             — the held currency slug (programme currency for 'hold', feeder for 'transfer').
// have            — the user's current balance in src (in that currency's units).
// need            — the minimum src points needed to cover miles_min (= miles_min × multiplier).
// path            — transfer hop slugs: [src, …, programme_currency] (empty for 'hold').
export type Afford = {
  tier: 'hold' | 'transfer'
  src: string // currency slug
  have: number
  need: number
  path: string[]
}

// AwardPlanRow extended with optional affordability annotations (no-source branch only).
export type ExploreRow = AwardPlanRow & {
  afford?: Record<Cabin, Afford | null>
}

export type AwardExploreResult = {
  origin: string
  destination: string
  source: string
  source_currency: string | null
  rows: ExploreRow[]
  airlines: ExploreAirline[]
  // slug → display_name, resolved from the KG, for every programme + every
  // transfer-path currency the rows reference. The UI renders these; it must NOT
  // hardcode names. Keyed by `row.programme` (bare program slug) and by the full
  // `currency/...` path slug.
  names: Record<string, string>
  // IATA → [lat, lng] for every airport in the routings (origin, destination,
  // hubs) — used to draw the flight map. From the DO's seeded airport table.
  airports: Record<string, [number, number]>
  notes: string[]
}

// ---- Holdings overlay (no-source branch) ------------------------------------
//
// Map ledger balance rows (Assets:Rewards:…:<leaf>) to currency slugs by
// checking the KB node's attrs.beancountName. Users typically hold very few
// loyalty currencies (< 20) so we resolve each leaf individually rather than
// paging the entire currency list.

type HeldBalance = { slug: string; balance: number }

async function buildHeldBalances(
  kb: KbHttp,
  accounts: ReadonlyArray<{ account: string }>,
  balances: ReadonlyArray<BalanceRow>,
): Promise<HeldBalance[]> {
  // Collect leaves of accounts under Assets:Rewards that carry a balance.
  const leafBalances = new Map<string, number>() // leaf → summed balance
  for (const b of balances) {
    const parts = b.account.split(':')
    if (parts[0] !== 'Assets' || parts[1] !== 'Rewards') continue
    if (b.balance_scaled === 0) continue
    const leaf = parts[parts.length - 1]
    const val = Number(b.balance_scaled) / 10 ** b.scale
    leafBalances.set(leaf, (leafBalances.get(leaf) ?? 0) + val)
  }
  // Also include accounts in snapshot that have no balance rows (balance 0).
  for (const a of accounts) {
    const parts = a.account.split(':')
    if (parts[0] !== 'Assets' || parts[1] !== 'Rewards') continue
    const leaf = parts[parts.length - 1]
    if (!leafBalances.has(leaf)) leafBalances.set(leaf, 0)
  }
  if (leafBalances.size === 0) return []

  // Resolve each leaf to a currency slug via KB (verified on beancountName —
  // resolve() items carry no attrs, so candidates are confirmed via get()).
  const results: HeldBalance[] = []
  await Promise.all(
    [...leafBalances.entries()].map(async ([leaf, balance]) => {
      const match = await resolveByBeancountName(kb, leaf, 'currency', leaf)
      if (match) results.push({ slug: match.slug, balance })
    }),
  )
  return results
}

// Annotate rows with affordability given the user's held currencies + the
// transfer graph from those currencies to the row destinations.
function annotateAfford(
  rows: AwardPlanRow[],
  held: HeldBalance[],
  grid: (TransferCell | null)[][],
  heldSlugs: string[],
  dests: string[],
): ExploreRow[] {
  if (held.length === 0) return rows.map((r) => ({ ...r }))

  const destIdx = new Map<string, number>(dests.map((d, i) => [d, i]))

  return rows.map((row): ExploreRow => {
    const cur = row.programme_currency
    const afford: Record<Cabin, Afford | null> = {
      economy: null,
      premium_economy: null,
      business: null,
      first: null,
    }

    for (const cabin of CABINS) {
      const milesCell = row.miles[cabin]
      if (!Array.isArray(milesCell)) continue // dynamic or null — skip
      const milesMin = milesCell[0]
      if (milesMin <= 0) continue

      // Can the user hold the programme currency directly?
      if (cur) {
        const direct = held.find((h) => h.slug === cur)
        if (direct && direct.balance >= milesMin) {
          afford[cabin] = { tier: 'hold', src: cur, have: direct.balance, need: milesMin, path: [] }
          continue
        }
      }

      // Otherwise find the cheapest transfer that covers milesMin.
      if (!cur) continue
      const dj = destIdx.get(cur)
      if (dj === undefined) continue

      let best: Afford | null = null
      for (let si = 0; si < heldSlugs.length; si++) {
        const h = held[si]
        const cell = grid[si]?.[dj]
        if (!cell) continue
        // Skip if this IS the direct case (already handled above without transfer).
        if (heldSlugs[si] === cur) continue
        const need = Math.ceil(milesMin * cell.multiplier)
        if (h.balance < need) continue
        if (!best || need < best.need) {
          best = { tier: 'transfer', src: heldSlugs[si], have: h.balance, need, path: cell.path }
        }
      }
      afford[cabin] = best
    }

    return { ...row, afford }
  })
}

// ---- Best-effort IATA → display name via the KB airline nodes; falls back to the
// bare code so the filter always has a label.
async function airlineName(kb: KbHttp, iata: string): Promise<string> {
  try {
    const r = (await kb.resolve(iata, { prefix: 'airline' })) as {
      items?: Array<{ display_name: string | null }>
    }
    return r.items?.[0]?.display_name ?? iata
  } catch {
    return iata
  }
}

async function airlinesFrom(kb: KbHttp, rows: AwardPlanRow[]): Promise<ExploreAirline[]> {
  const codes = new Set<string>()
  for (const r of rows) for (const rt of r.routings) for (const c of rt.carriers) if (c) codes.add(c)
  return Promise.all(
    [...codes].sort().map(async (iata) => ({ iata, name: await airlineName(kb, iata) })),
  )
}

// Resolve display_name from the KG for every programme + path currency in the
// rows. The map is keyed by exactly what the UI looks up: the bare programme
// slug (`row.programme`) and the full `currency/...` path slug.
// `extraSlugs` are additional currency slugs to resolve (e.g. held currencies
// in the no-source holdings overlay).
async function resolveNames(
  kb: KbHttp,
  rows: AwardPlanRow[],
  extraSlugs: string[] = [],
): Promise<Record<string, string>> {
  // node slug → lookup key the UI uses
  const wanted = new Map<string, string>()
  for (const r of rows) {
    wanted.set(`program/${r.programme}`, r.programme)
    for (const p of r.path) wanted.set(p, p) // p is already `currency/...`
  }
  for (const s of extraSlugs) wanted.set(s, s)
  const names: Record<string, string> = {}
  await Promise.all(
    [...wanted].map(async ([node, key]) => {
      try {
        const n = (await kb.get(node)) as { display_name?: string | null } | null
        if (n?.display_name) names[key] = n.display_name
      } catch {
        /* leave unset — the UI falls back to a prettified slug */
      }
    }),
  )
  return names
}

export async function buildAwardExplore(
  lookup: AirportLookup,
  db: SqlStorage,
  apiKey: string,
  kb: KbHttp,
  origin: string,
  destination: string,
  source?: string,
  // Optional ledger data for the no-source holdings overlay.
  // When provided (and source is absent), rows are annotated with `afford`.
  holdingsAccounts?: ReadonlyArray<{ account: string }> | null,
  holdingsBalances?: ReadonlyArray<BalanceRow> | null,
): Promise<AwardExploreResult> {
  // Base = origin/destination/source/rows/notes, from the costed plan join when a
  // source is given, else the card-agnostic options with cost fields blanked.
  let base: {
    origin: string
    destination: string
    source: string
    source_currency: string | null
    rows: ExploreRow[]
    notes: string[]
  }
  // Held currency slugs from the holdings overlay — extra names to resolve.
  let heldSlugsForNames: string[] = []

  if (source && source.trim()) {
    const plan = await buildAwardPlan(lookup, db, apiKey, kb, origin, destination, source.trim())
    // Explicit source: no afford annotation — exact today's behavior.
    base = { ...plan }
  } else {
    const opts = await computeAwardOptions(lookup, db, apiKey, kb, origin, destination)
    const blankCost: AwardPlanRow['cost'] = {
      economy: null,
      premium_economy: null,
      business: null,
      first: null,
    }
    const baseRows: AwardPlanRow[] = opts.options.map(
      (o): AwardPlanRow => ({
        programme: o.programme,
        programme_currency: o.programme_currency,
        own_metal: o.own_metal,
        stops: o.stops,
        routings: o.routings,
        total_distance: o.total_distance,
        published: o.published,
        miles: o.cabins as AwardPlanRow['miles'],
        reachable: false,
        multiplier: null,
        hops: null,
        path: [],
        cost: { ...blankCost },
      }),
    )

    // ---- Holdings overlay ----
    // Build the list of held currency slugs + balances, then run ONE
    // transferGraph call to price every (held → programme_currency) pair.
    let exploreRows: ExploreRow[] = baseRows.map((r) => ({ ...r }))

    if (holdingsAccounts && holdingsBalances) {
      const held = await buildHeldBalances(kb, holdingsAccounts, holdingsBalances)
      if (held.length > 0) {
        const heldSlugs = held.map((h) => h.slug)
        heldSlugsForNames = heldSlugs
        const grid = await transferGraph(kb, heldSlugs, opts.dests)
        exploreRows = annotateAfford(baseRows, held, grid, heldSlugs, opts.dests)
      }
    }

    base = {
      origin: opts.origin,
      destination: opts.destination,
      source: '',
      source_currency: null,
      notes: opts.notes,
      rows: exploreRows,
    }
  }

  const [airlines, names] = await Promise.all([
    airlinesFrom(kb, base.rows),
    resolveNames(kb, base.rows, heldSlugsForNames),
  ])

  // Coordinates for every airport in the routings (origin, destination, hubs).
  const codes = new Set<string>([base.origin, base.destination])
  for (const r of base.rows) for (const rt of r.routings) if (rt.hub) codes.add(rt.hub)
  const airports: Record<string, [number, number]> = {}
  for (const c of codes) {
    const a = lookup(c)
    if (a) airports[c] = [a[0], a[1]]
  }

  return { ...base, airlines, names, airports }
}

// re-exported for callers that only want the cabin constant
export { CABINS as EXPLORE_CABINS }
export type { Cabin as ExploreCabin }

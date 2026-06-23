import type { KbHttp } from './kb-tools'

// The data layer for the PATHS-TO-POINTS page — the backward dual of the award
// explorer. Given a target loyalty PROGRAMME, it walks the account model
// backward to find every way to accumulate it, and returns a React-Flow-ready
// graph: nodes (target / programme / card / fiat) + edges (transfer / earn).
//
// Program-keyed end to end on the NEW account model — no legacy edges:
//   • TRANSFERS  (program → program)  — incoming, walked backward to find every
//     programme that can transfer into the target (cheapest cumulative ratio,
//     Dijkstra-style over the ratio-weighted reversed graph, bounded to 3 hops
//     since gain-edges otherwise money-pump).
//   • EARNS_INTO (card → program)     — incoming, the cards that earn each.
//   • BUYS_INTO  (fiat → program)     — incoming, buying points with cash.
// Currencies are not nodes: each programme carries the currency TICKERS it is
// denominated in (collected from the edges it touches) so the ledger overlay
// can match the user's holdings by commodity.

const MAX_HOPS = 3

export type PathNodeKind = 'target' | 'program' | 'card' | 'fiat'

export type PathNode = {
  id: string // slug (program/…, cc/…, or a fiat currency/… for buy-ins)
  kind: PathNodeKind
  display: string
  // For programmes (target / program / fiat): the currency tickers this node is
  // denominated in, collected from the edges it touches. The ledger overlay
  // matches the user's holdings against these (commodity identity).
  tickers?: string[]
  // For cards: the issuer (bank) beancountName, so the UI can show / a later
  // step can match `Liabilities:CreditCards:<issuer>:<beancountName>`.
  issuer?: string | null
  // For cards: the KG product name, used for the tolerant account-leaf match.
  // For fiat: the fiat currency code (USD/INR) the UI renders as the price unit.
  beancountName?: string | null
  // Cheapest source-points-per-target-point to reach the target from here
  // (1 for the target itself). Cards inherit their earned programme's value.
  // Fiat: CASH minor units (cents/paise) per 1 target point — a price, not a
  // points ratio.
  multiplier?: number
  hops?: number
  // The cheapest route to the target as a slug sequence (source → … → target).
  // Lets the UI draw a clean "best routes only" tree instead of every edge.
  path?: string[]
  // True for fiat money (USD, INR, …) buy-in nodes.
  fiat?: boolean
  // Set by the "my accounts" step: this card/programme matches an account the
  // user already holds in their ledger. Fiat nodes are always held — the user
  // can always pay cash.
  held?: boolean
  // The user's current balance in this node's ledger account (when held).
  balance?: number | null
  balanceCurrency?: string | null
}

export type PathEdge = {
  from: string
  to: string
  kind: 'transfer' | 'earn'
  // Present on transfer edges: rs units of `from` buy rd units of `to`. On a
  // fiat (buy) edge, rs is cash in minor units.
  ratio_source?: number
  ratio_dest?: number
  multiplier?: number // rs/rd for this single hop
}

export type PointsPathsResult = {
  target: { slug: string; display: string; beancountName: string | null }
  amount: number | null
  nodes: PathNode[]
  edges: PathEdge[]
  notes: string[]
}

type Node = { slug: string; display_name: string | null; attrs?: Record<string, unknown> | null }
type Related = { items?: Array<{ other: string; attrs?: Record<string, unknown> | null }> }

const beancount = (n: Node | null): string | null => {
  const v = n?.attrs?.beancountName
  return typeof v === 'string' ? v : null
}
const tickerStr = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const prettySlug = (slug: string) =>
  slug
    .replace(/^[a-z]+\//, '')
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')

// ── target resolution ────────────────────────────────────────────────────────
// Resolve free text / a slug to a canonical PROGRAMME slug. The picker emits
// `program/…` slugs (the common path); free text falls back to KG resolution.
async function resolveProgram(kb: KbHttp, text: string): Promise<string | null> {
  const t = text.trim()
  if (t.startsWith('program/')) return t
  // currency/… or cc/… deep-links: search the programme index by the words.
  const query = /^[a-z]+\//.test(t) ? t.replace(/^[a-z]+\//, '').replace(/-/g, ' ') : t
  try {
    const r = (await kb.resolve(query, { prefix: 'program' })) as { items?: Array<{ slug: string }> }
    const top = r.items?.[0]?.slug
    return top?.startsWith('program/') ? top : null
  } catch {
    return null
  }
}

// Cheapest (min cumulative multiplier) path from every programme that can REACH
// `target` within MAX_HOPS, in one backward pass over incoming TRANSFERS edges.
// multiplier = source-programme points per 1 target point; the hop bound keeps
// gain-edges (multiplier < 1) from money-pumping a cheaper-but-fake path.
type Reach = { multiplier: number; hops: number; path: string[] }
async function cheapestTo(
  incoming: (program: string) => Promise<Related>,
  target: string,
): Promise<Map<string, Reach>> {
  type Best = { mult: number; hops: number; path: string[] }
  const best = new Map<string, Best>([[target, { mult: 1, hops: 0, path: [target] }]])
  let frontier = [target]
  for (let depth = 0; depth < MAX_HOPS && frontier.length; depth++) {
    const next: string[] = []
    for (const node of frontier) {
      const cur = best.get(node)!
      const r = await incoming(node)
      for (const it of r.items ?? []) {
        if (!it.other.startsWith('program/') || it.other === target) continue
        const rs = Number(it.attrs?.ratio_source)
        const rd = Number(it.attrs?.ratio_dest)
        if (!(rs > 0 && rd > 0)) continue
        // rs `from` buy rd `node`; 1 node costs rs/rd `from`. Compose toward target.
        const mult = cur.mult * (rs / rd)
        const prev = best.get(it.other)
        if (!prev || mult < prev.mult) {
          best.set(it.other, { mult, hops: cur.hops + 1, path: [it.other, ...cur.path] })
          next.push(it.other)
        }
      }
    }
    frontier = next
  }
  best.delete(target)
  return new Map([...best].map(([slug, b]) => [slug, { multiplier: b.mult, hops: b.hops, path: b.path }]))
}

export async function buildPointsPaths(
  kb: KbHttp,
  targetText: string,
  amount?: number,
): Promise<PointsPathsResult> {
  const notes: string[] = []
  const target = await resolveProgram(kb, targetText)
  if (!target) {
    return {
      target: { slug: '', display: targetText, beancountName: null },
      amount: amount ?? null,
      nodes: [],
      edges: [],
      notes: [`could not resolve "${targetText}" to a loyalty programme`],
    }
  }

  // Memoised incoming-edge fetchers (each programme is visited a few times).
  const relatedIn = (edgeType: string) => {
    const cache = new Map<string, Related>()
    return async (program: string): Promise<Related> => {
      const hit = cache.get(program)
      if (hit) return hit
      let r: Related = {}
      try {
        r = (await kb.related(program, { edge_type: edgeType, direction: 'incoming' })) as Related
      } catch {
        r = {}
      }
      cache.set(program, r)
      return r
    }
  }
  const transfersIn = relatedIn('TRANSFERS')
  const earnsIn = relatedIn('EARNS_INTO')
  const buysIn = relatedIn('BUYS_INTO')
  const safeGet = async (slug: string): Promise<Node | null> => {
    try {
      return (await kb.get(slug)) as Node | null
    } catch {
      return null
    }
  }

  // 1. Cheapest ratio from every programme that can reach the target.
  const reach = await cheapestTo(transfersIn, target)
  const programs = new Set<string>([target, ...reach.keys()])

  // 2. For each programme in the subgraph: its incoming transfer edges (kept
  //    when the feeder is also in-subgraph), the cards that earn it, and the
  //    fiat currencies that buy into it. Collect each programme's tickers from
  //    the currencies named on those edges.
  const edges: PathEdge[] = []
  const cardSlugs = new Set<string>()
  const cardEarns: Array<{ card: string; program: string }> = []
  const fiatSlugs = new Set<string>()
  // fiat → its cheapest cash-per-target buy and the route it implies
  type FiatBuy = { multiplier: number; hops: number; path: string[] }
  const fiatBest = new Map<string, FiatBuy>()
  const tickersOf = new Map<string, Set<string>>()
  const addTicker = (program: string, t: string | null) => {
    if (!t) return
    ;(tickersOf.get(program) ?? tickersOf.set(program, new Set()).get(program)!).add(t)
  }

  await Promise.all(
    [...programs].map(async (p) => {
      const [t, e, b] = await Promise.all([transfersIn(p), earnsIn(p), buysIn(p)])
      for (const it of t.items ?? []) {
        if (!programs.has(it.other)) continue
        const rs = Number(it.attrs?.ratio_source)
        const rd = Number(it.attrs?.ratio_dest)
        if (!(rs > 0 && rd > 0)) continue
        edges.push({ from: it.other, to: p, kind: 'transfer', ratio_source: rs, ratio_dest: rd, multiplier: rs / rd })
        addTicker(it.other, tickerStr(it.attrs?.from_currency))
        addTicker(p, tickerStr(it.attrs?.to_currency))
      }
      for (const it of e.items ?? []) {
        if (!it.other.startsWith('cc/')) continue
        cardSlugs.add(it.other)
        cardEarns.push({ card: it.other, program: p })
        edges.push({ from: it.other, to: p, kind: 'earn' })
        addTicker(p, tickerStr(it.attrs?.currency))
      }
      for (const it of b.items ?? []) {
        if (!it.other.startsWith('currency/')) continue
        const rs = Number(it.attrs?.ratio_source)
        const rd = Number(it.attrs?.ratio_dest)
        if (!(rs > 0 && rd > 0)) continue
        fiatSlugs.add(it.other)
        edges.push({ from: it.other, to: p, kind: 'transfer', ratio_source: rs, ratio_dest: rd, multiplier: rs / rd })
        addTicker(p, tickerStr(it.attrs?.currency))
        // Cash minor-units per 1 TARGET point via this buy + downstream transfer.
        const downstream = p === target ? 1 : (reach.get(p)?.multiplier ?? Infinity)
        const cashPerTarget = (rs / rd) * downstream
        const hops = (p === target ? 0 : (reach.get(p)?.hops ?? 0)) + 1
        const path = [it.other, ...(p === target ? [target] : (reach.get(p)?.path ?? [target]))]
        const prev = fiatBest.get(it.other)
        if (!prev || cashPerTarget < prev.multiplier) fiatBest.set(it.other, { multiplier: cashPerTarget, hops, path })
      }
    }),
  )

  // 3. Resolve display + attrs for every node, and each card's issuer.
  const allSlugs = [...programs, ...cardSlugs, ...fiatSlugs]
  const fetched = new Map<string, Node>()
  await Promise.all(
    allSlugs.map(async (slug) => {
      const n = await safeGet(slug)
      if (n) fetched.set(slug, n)
    }),
  )
  const issuerOf = new Map<string, string | null>()
  await Promise.all(
    [...cardSlugs].map(async (cc) => {
      let r: Related = {}
      try {
        r = (await kb.related(cc, { edge_type: 'ISSUED_BY', direction: 'outgoing' })) as Related
      } catch {
        r = {}
      }
      const bankSlug = r.items?.find((i) => i.other.startsWith('bank/'))?.other
      issuerOf.set(cc, bankSlug ? beancount(await safeGet(bankSlug)) : null)
    }),
  )

  const nameOf = (slug: string) => fetched.get(slug)?.display_name ?? prettySlug(slug)
  const tickerList = (program: string) => [...(tickersOf.get(program) ?? [])]

  const nodes: PathNode[] = []
  nodes.push({
    id: target,
    kind: 'target',
    display: nameOf(target),
    tickers: tickerList(target),
    multiplier: 1,
    hops: 0,
  })
  for (const p of programs) {
    if (p === target) continue
    const cell = reach.get(p)
    nodes.push({
      id: p,
      kind: 'program',
      display: nameOf(p),
      tickers: tickerList(p),
      multiplier: cell?.multiplier,
      hops: cell?.hops,
      path: cell?.path,
    })
  }
  // a card's value = the cheapest value of the programme it earns into
  const programMult = new Map<string, number>([[target, 1], ...[...reach].map(([s, c]) => [s, c.multiplier] as const)])
  for (const cc of cardSlugs) {
    const earned = cardEarns.filter((e) => e.card === cc).map((e) => e.program)
    const best = earned.reduce<{ m: number } | null>((acc, p) => {
      const m = programMult.get(p)
      return m != null && (acc === null || m < acc.m) ? { m } : acc
    }, null)
    nodes.push({
      id: cc,
      kind: 'card',
      display: nameOf(cc),
      issuer: issuerOf.get(cc) ?? null,
      beancountName: beancount(fetched.get(cc) ?? null),
      multiplier: best?.m,
    })
  }
  for (const f of fiatSlugs) {
    const node = fetched.get(f) ?? null
    const buy = fiatBest.get(f)
    nodes.push({
      id: f,
      kind: 'fiat',
      display: nameOf(f),
      // The fiat currency code (USD/INR) the UI renders as the price unit.
      beancountName: beancount(node) ?? tickerStr(node?.attrs?.ticker),
      multiplier: buy?.multiplier,
      hops: buy?.hops,
      path: buy?.path,
      fiat: true,
      held: true, // cash is always available
    })
  }

  notes.push(
    `${programs.size - 1} feeder programmes, ${cardSlugs.size} earning cards, ${fiatSlugs.size} cash buy-ins within ${MAX_HOPS} transfer hops`,
  )

  return {
    target: { slug: target, display: nameOf(target), beancountName: null },
    amount: amount ?? null,
    nodes,
    edges,
    notes,
  }
}

// ── ledger holdings overlay ──────────────────────────────────────────────────
// Mark what the user already holds and attach the current balance.
//   • programmes (target / program): held when the user holds a balance in ANY
//     of the programme's currency tickers (commodity identity), summed.
//   • cards: matched by issuer + product name against the card account path.
//   • fiat: always held (cash); never a ledger balance.

export type BalanceRow = { account: string; currency: string; scale: number; balance_scaled: number }

function matchCard(node: PathNode, account: string): boolean {
  if (!node.beancountName) return false
  const parts = account.split(':')
  if (parts[0] !== 'Liabilities' || parts[1] !== 'CreditCards') return false
  if (node.issuer && parts[2] !== node.issuer) return false
  const leaf = (parts[3] ?? '').toLowerCase()
  if (!leaf) return false
  if (leaf === node.beancountName.toLowerCase()) return true
  // Tolerant: users name card accounts loosely ("Infinia" vs the KG's
  // "InfiniaMetal") — held when the account leaf appears among the card's name
  // tokens. Exact-match-only silently un-held real cards and the "My points"
  // filter then hid their entire path.
  const tokens = new Set(
    `${node.beancountName.replace(/([a-z0-9])([A-Z])/g, '$1 $2')} ${node.display ?? ''}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  )
  return tokens.has(leaf)
}

export function applyHoldings(
  result: PointsPathsResult,
  accounts: ReadonlyArray<{ account: string }>,
  balances: ReadonlyArray<BalanceRow>,
): void {
  const pending = (account: string) => account.endsWith(':Pending')
  for (const node of result.nodes) {
    if (node.fiat) continue // cash is conceptually held; never a ledger balance
    if (node.kind === 'card') {
      const held = accounts.some((a) => !pending(a.account) && matchCard(node, a.account))
      if (held) node.held = true
      continue
    }
    // programme: any rewards balance in one of this programme's tickers
    // (spendable only: :Pending excluded).
    const tickers = new Set(node.tickers ?? [])
    if (!tickers.size) continue
    const rows = balances.filter(
      (b) => b.account.startsWith('Assets:Rewards:') && !pending(b.account) && tickers.has(b.currency),
    )
    if (!rows.length) continue
    node.held = true
    node.balance = rows.reduce((sum, r) => sum + Number(r.balance_scaled) / 10 ** r.scale, 0)
    node.balanceCurrency = rows[0].currency
  }
}

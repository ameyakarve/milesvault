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
  // The specific currency tickers the user actually holds in this programme
  // (subset of `tickers`). "My points" seeds its forward walk from these so a
  // multi-tier portal only shows the tiers you can really feed.
  heldTickers?: string[]
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
  transfer_time?: string | null // how long the transfer takes to land (e.g. "instant", "2-3 days")
  // The source-side currency this edge moves (the TRANSFERS `from_currency`).
  // A multi-tier portal (e.g. Axis TravelEdge) has SEVERAL edges between the
  // same two programmes — one per tier currency, each with its own ratio — so
  // this is what distinguishes them once both endpoints collapse to one node.
  variant?: string
  // The currency DELIVERED by this edge (TRANSFERS `to_currency`; for earn/buy
  // edges, the currency that lands). Lets "My points" walk forward from what
  // you actually hold (held cards' / balances' currencies) and keep only the
  // tier edges you can really feed — not every tier the portal offers.
  to_currency?: string
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

// (programme, currency) reachability — the heart of correctness. A STATE means
// "holding `currency` in `programme`, you can reach the target." We walk
// TRANSFERS backward from the target and follow an edge ONLY when its
// `to_currency` is the currency we need in the destination — so a card's
// specific tier-currency counts only if THAT currency actually transfers all the
// way along the chain. (Without this, HDFC BizBlack — KrisFlyer-only — would
// wrongly show on an Accor path just because it shares the SmartBuy programme
// with Infinia, whose currency is the one that transfers.)
// multiplier = source-currency units per 1 target unit; the hop bound stops a
// gain-edge (multiplier < 1) from money-pumping a cheaper-but-fake path. The map
// is keyed by stateKey(programme, currency) and INCLUDES the target's own seeds.
type Reach = { multiplier: number; hops: number; path: string[] }
const stateKey = (program: string, currency: string) => `${program}\t${currency}`

async function reachStates(
  transfersIn: (program: string) => Promise<Related>,
  target: string,
  targetCurrencies: Set<string>,
): Promise<Map<string, Reach>> {
  const best = new Map<string, Reach>()
  let frontier: Array<{ program: string; currency: string }> = []
  for (const c of targetCurrencies) {
    best.set(stateKey(target, c), { multiplier: 1, hops: 0, path: [target] })
    frontier.push({ program: target, currency: c })
  }
  for (let depth = 0; depth < MAX_HOPS && frontier.length; depth++) {
    const next: Array<{ program: string; currency: string }> = []
    for (const st of frontier) {
      const cur = best.get(stateKey(st.program, st.currency))!
      const r = await transfersIn(st.program)
      for (const it of r.items ?? []) {
        if (!it.other.startsWith('program/') || it.other === target) continue
        const to = tickerStr(it.attrs?.to_currency)
        const from = tickerStr(it.attrs?.from_currency)
        if (!to || !from || to !== st.currency) continue // edge must DELIVER the needed currency
        const rs = Number(it.attrs?.ratio_source)
        const rd = Number(it.attrs?.ratio_dest)
        if (!(rs > 0 && rd > 0)) continue
        const mult = cur.multiplier * (rs / rd)
        const k = stateKey(it.other, from)
        const prev = best.get(k)
        if (!prev || mult < prev.multiplier) {
          best.set(k, { multiplier: mult, hops: cur.hops + 1, path: [it.other, ...cur.path] })
          next.push({ program: it.other, currency: from })
        }
      }
    }
    frontier = next
  }
  return best
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

  // 1. The target's own currency/currencies — what "arrives" at the target:
  //    to_currency of its incoming TRANSFERS, plus anything earned/bought
  //    directly into it. These seed the reachability walk.
  const [tInTarget, eInTarget, bInTarget] = await Promise.all([
    transfersIn(target),
    earnsIn(target),
    buysIn(target),
  ])
  const targetCurrencies = new Set<string>()
  const addCcy = (c: string | null) => {
    if (c) targetCurrencies.add(c)
  }
  for (const it of tInTarget.items ?? []) addCcy(tickerStr(it.attrs?.to_currency))
  for (const it of eInTarget.items ?? []) addCcy(tickerStr(it.attrs?.currency))
  for (const it of bInTarget.items ?? []) addCcy(tickerStr(it.attrs?.currency))

  // 2. (programme, currency) reachability — currency-consistent chains only.
  const states = await reachStates(transfersIn, target, targetCurrencies)
  const hasState = (program: string, currency: string | null) =>
    currency != null && states.has(stateKey(program, currency))
  // Feeder programmes (state programmes minus the target) + each programme's
  // reachable currencies + its single cheapest state (for the node's value).
  const programs = new Set<string>()
  const reachCcys = new Map<string, Set<string>>()
  const progBest = new Map<string, Reach>()
  for (const [k, r] of states) {
    const tab = k.indexOf('\t')
    const p = k.slice(0, tab)
    const c = k.slice(tab + 1)
    if (p === target) continue
    programs.add(p)
    ;(reachCcys.get(p) ?? reachCcys.set(p, new Set()).get(p)!).add(c)
    const prev = progBest.get(p)
    if (!prev || r.multiplier < prev.multiplier) progBest.set(p, r)
  }

  // 3. Per programme, keep ONLY the transfer edges, earning cards, and fiat
  //    buy-ins that lie on a currency-valid path (from/to currency must match a
  //    reachable state — that's what keeps an invalid tier off the graph).
  const edges: PathEdge[] = []
  const cardSlugs = new Set<string>()
  const cardEarns: Array<{ card: string; program: string; currency: string }> = []
  const fiatSlugs = new Set<string>()
  type FiatBuy = { multiplier: number; hops: number; path: string[] }
  const fiatBest = new Map<string, FiatBuy>()

  await Promise.all(
    [target, ...programs].map(async (p) => {
      const [t, e, b] = await Promise.all([transfersIn(p), earnsIn(p), buysIn(p)])
      for (const it of t.items ?? []) {
        // Skip non-programmes and the target itself as a SOURCE: the target's own
        // outbound edges (e.g. Accor → KrisFlyer) must not become feeder edges,
        // or they form Accor↔airline cycles and stop the target ranking rightmost.
        if (!it.other.startsWith('program/') || it.other === target) continue
        const from = tickerStr(it.attrs?.from_currency)
        const to = tickerStr(it.attrs?.to_currency)
        // Keep the edge only if it delivers a needed currency into p AND its
        // source currency is itself reachable in the feeder.
        if (!hasState(p, to) || !hasState(it.other, from)) continue
        const rs = Number(it.attrs?.ratio_source)
        const rd = Number(it.attrs?.ratio_dest)
        if (!(rs > 0 && rd > 0)) continue
        edges.push({ from: it.other, to: p, kind: 'transfer', ratio_source: rs, ratio_dest: rd, multiplier: rs / rd, transfer_time: tickerStr(it.attrs?.transfer_time), variant: from ?? undefined, to_currency: to ?? undefined })
      }
      for (const it of e.items ?? []) {
        if (!it.other.startsWith('cc/')) continue
        const c = tickerStr(it.attrs?.currency)
        if (!hasState(p, c)) continue // the card's EARNED currency must reach the target
        cardSlugs.add(it.other)
        cardEarns.push({ card: it.other, program: p, currency: c! })
        edges.push({ from: it.other, to: p, kind: 'earn', to_currency: c ?? undefined })
      }
      for (const it of b.items ?? []) {
        if (!it.other.startsWith('currency/')) continue
        const c = tickerStr(it.attrs?.currency)
        if (!hasState(p, c)) continue // the bought currency must reach the target
        const rs = Number(it.attrs?.ratio_source)
        const rd = Number(it.attrs?.ratio_dest)
        if (!(rs > 0 && rd > 0)) continue
        fiatSlugs.add(it.other)
        edges.push({ from: it.other, to: p, kind: 'transfer', ratio_source: rs, ratio_dest: rd, multiplier: rs / rd, variant: c ?? undefined, to_currency: c ?? undefined })
        // Cash minor-units per 1 TARGET point via this buy + downstream transfer.
        const st = p === target ? null : states.get(stateKey(p, c!))
        const cashPerTarget = (rs / rd) * (p === target ? 1 : (st?.multiplier ?? Infinity))
        const hops = (st?.hops ?? 0) + 1
        const path = [it.other, ...(st?.path ?? [target])]
        const prev = fiatBest.get(it.other)
        if (!prev || cashPerTarget < prev.multiplier) fiatBest.set(it.other, { multiplier: cashPerTarget, hops, path })
      }
    }),
  )

  // 4. Resolve display + attrs for every node, and each card's issuer.
  const allSlugs = [target, ...programs, ...cardSlugs, ...fiatSlugs]
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
  // A programme's tickers = the currencies in which it can REACH the target
  // (its reachable states), so the holdings overlay only marks it "held" when
  // the user holds a currency that's actually on a valid path.
  const tickerList = (program: string) =>
    program === target ? [...targetCurrencies] : [...(reachCcys.get(program) ?? [])]

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
    const cell = progBest.get(p)
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
  // a card's value = the cheapest valid (programme, earned-currency) it reaches.
  // Keep that state's PATH too: a card's real route can differ from its
  // programme's cheapest route (e.g. BizBlack reaches Accor only via SmartBuy →
  // KrisFlyer, while SmartBuy's own cheapest route is the direct Infinia one), so
  // the holdings overlay must trace the CARD's currency-path, not the programme's.
  for (const cc of cardSlugs) {
    const mine = cardEarns.filter((e) => e.card === cc)
    let best: { m: number; path: string[] } | null = null
    for (const e of mine) {
      const st = e.program === target ? { multiplier: 1, path: [target] } : states.get(stateKey(e.program, e.currency))
      if (!st || !Number.isFinite(st.multiplier)) continue
      if (best === null || st.multiplier < best.m) best = { m: st.multiplier, path: st.path }
    }
    nodes.push({
      id: cc,
      kind: 'card',
      display: nameOf(cc),
      issuer: issuerOf.get(cc) ?? null,
      beancountName: beancount(fetched.get(cc) ?? null),
      multiplier: best?.m,
      path: best?.path,
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
    `${programs.size} feeder programmes, ${cardSlugs.size} earning cards, ${fiatSlugs.size} cash buy-ins within ${MAX_HOPS} transfer hops`,
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
  // EXACT match only. By owner convention a card account's product segment IS
  // the card's KG beancountName, verbatim — `Liabilities:CreditCards:<issuer>:
  // <beancountName>[:<id>]`. Match the product segment dead-on; no lowercasing,
  // no token-overlap, no fuzzy fallback (a wrong match is worse than no match).
  return parts[3] === node.beancountName
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
    node.heldTickers = [...new Set(rows.map((r) => r.currency))]
  }
}

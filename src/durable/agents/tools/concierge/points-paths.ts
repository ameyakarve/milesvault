import type { KbHttp } from './kb-tools'
import { cheapestTo, resolveCurrency } from './transfer-graph'

// The data layer for the PATHS-TO-POINTS page — the backward dual of the award
// explorer. Given a target loyalty currency, it walks the transfer graph
// backward (TRANSFERS_TO incoming) to find every currency that can reach it,
// then DENOMINATED_IN incoming to find the cards that earn each, and returns a
// React-Flow-ready graph: nodes (target / currency / card) + edges (transfer /
// earn). Each source carries its CHEAPEST cumulative ratio to the target
// (source points per 1 target point), computed Dijkstra-style over the
// ratio-weighted reversed graph (bounded to 3 hops — gain edges otherwise
// money-pump). No card: compute on demand.

export type PathNodeKind = 'target' | 'currency' | 'card'

export type PathNode = {
  id: string // slug
  kind: PathNodeKind
  display: string
  beancountName: string | null
  // For cards: the issuer (bank) beancountName, so the UI can show / a later
  // step can match `Liabilities:CreditCards:<issuer>:<beancountName>`.
  issuer?: string | null
  // Cheapest source-points-per-target-point to reach the target from here
  // (1 for the target itself). Cards inherit their earned currency's value.
  multiplier?: number
  hops?: number
  // The cheapest route to the target as a slug sequence (source → … → target).
  // Lets the UI draw a clean "best routes only" tree instead of every edge.
  path?: string[]
  // True for fiat money (USD, INR, …) sources — buying points is a TRANSFERS_TO
  // edge from a fiat currency, so the multiplier here is a CASH price (source
  // currency's minor units per 1 target point), not a points ratio.
  fiat?: boolean
  // Set by the "my accounts" step: this card/currency matches an account the
  // user already holds in their ledger (matched via beancountName). Fiat nodes
  // are always held — the user can always pay cash.
  held?: boolean
  // The user's current balance in this node's ledger account (when held).
  // `balance` is the decimal amount, `balanceCurrency` its commodity code.
  balance?: number | null
  balanceCurrency?: string | null
}

export type PathEdge = {
  from: string
  to: string
  kind: 'transfer' | 'earn'
  // Present on transfer edges: rs units of `from` buy rd units of `to`.
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

const beancount = (n: Node | null): string | null => {
  const v = n?.attrs?.beancountName
  return typeof v === 'string' ? v : null
}
const isFiat = (n: Node | null): boolean => n?.attrs?.fiat === true
const prettySlug = (slug: string) =>
  slug
    .replace(/^[a-z]+\//, '')
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')

export async function buildPointsPaths(
  kb: KbHttp,
  targetText: string,
  amount?: number,
): Promise<PointsPathsResult> {
  const notes: string[] = []
  const target = await resolveCurrency(kb, targetText)
  if (!target) {
    return {
      target: { slug: '', display: targetText, beancountName: null },
      amount: amount ?? null,
      nodes: [],
      edges: [],
      notes: [`could not resolve "${targetText}" to a loyalty currency`],
    }
  }

  // 1. Cheapest ratio from every currency that can reach the target.
  const reach = await cheapestTo(kb, target)
  const currencies = new Set<string>([target, ...reach.keys()])

  // 2. For each currency in the subgraph: its incoming transfer edges (kept when
  //    the feeder is also in-subgraph) and the cards that earn it.
  type InItems = { items?: Array<{ other: string; attrs?: Record<string, unknown> | null }> }
  const inEdges = async (slug: string): Promise<InItems> => {
    try {
      return (await kb.related(slug, { edge_type: 'TRANSFERS_TO', direction: 'incoming' })) as InItems
    } catch {
      return {}
    }
  }
  const earners = async (slug: string): Promise<{ items?: Array<{ other: string }> }> => {
    try {
      return (await kb.related(slug, { edge_type: 'DENOMINATED_IN', direction: 'incoming' })) as {
        items?: Array<{ other: string }>
      }
    } catch {
      return {}
    }
  }
  const safeGet = async (slug: string): Promise<Node | null> => {
    try {
      return (await kb.get(slug)) as Node | null
    } catch {
      return null
    }
  }

  const edges: PathEdge[] = []
  const cardSlugs = new Set<string>()
  const cardEarns: Array<{ card: string; currency: string }> = []

  await Promise.all(
    [...currencies].map(async (c) => {
      const [t, d] = await Promise.all([inEdges(c), earners(c)])
      for (const it of t.items ?? []) {
        if (!currencies.has(it.other)) continue
        const rs = Number(it.attrs?.ratio_source)
        const rd = Number(it.attrs?.ratio_dest)
        if (rs > 0 && rd > 0)
          edges.push({ from: it.other, to: c, kind: 'transfer', ratio_source: rs, ratio_dest: rd, multiplier: rs / rd })
      }
      for (const it of d.items ?? []) {
        if (!it.other.startsWith('cc/')) continue
        cardSlugs.add(it.other)
        cardEarns.push({ card: it.other, currency: c })
        edges.push({ from: it.other, to: c, kind: 'earn' })
      }
    }),
  )

  // 3. Resolve display + beancountName for every node, and each card's issuer.
  const allSlugs = [...currencies, ...cardSlugs]
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
      let r: { items?: Array<{ other: string }> } = {}
      try {
        r = (await kb.related(cc, { edge_type: 'ISSUED_BY', direction: 'outgoing' })) as {
          items?: Array<{ other: string }>
        }
      } catch {
        r = {}
      }
      const bankSlug = r.items?.find((i) => i.other.startsWith('bank/'))?.other
      if (!bankSlug) {
        issuerOf.set(cc, null)
        return
      }
      issuerOf.set(cc, beancount(await safeGet(bankSlug)))
    }),
  )

  const nameOf = (slug: string) => fetched.get(slug)?.display_name ?? prettySlug(slug)

  const nodes: PathNode[] = []
  nodes.push({
    id: target,
    kind: 'target',
    display: nameOf(target),
    beancountName: beancount(fetched.get(target) ?? null),
    multiplier: 1,
    hops: 0,
  })
  for (const c of currencies) {
    if (c === target) continue
    const node = fetched.get(c) ?? null
    const cell = reach.get(c)
    const fiat = isFiat(node)
    nodes.push({
      id: c,
      kind: 'currency',
      display: nameOf(c),
      beancountName: beancount(node),
      multiplier: cell?.multiplier,
      hops: cell?.hops,
      path: cell?.path,
      fiat,
      // Fiat is always "owned" — you can always pay cash to buy in.
      held: fiat ? true : undefined,
    })
  }
  // a card's value = the cheapest value of the currency it earns into
  const currencyMult = new Map<string, number>([[target, 1], ...[...reach].map(([s, c]) => [s, c.multiplier] as const)])
  for (const cc of cardSlugs) {
    const earned = cardEarns.filter((e) => e.card === cc).map((e) => e.currency)
    const best = earned.reduce<{ m: number; c: string } | null>((acc, c) => {
      const m = currencyMult.get(c)
      return m != null && (acc === null || m < acc.m) ? { m, c } : acc
    }, null)
    nodes.push({
      id: cc,
      kind: 'card',
      display: nameOf(cc),
      beancountName: beancount(fetched.get(cc) ?? null),
      issuer: issuerOf.get(cc) ?? null,
      multiplier: best?.m,
    })
  }

  notes.push(
    `${currencies.size - 1} feeder currencies, ${cardSlugs.size} earning cards within 3 transfer hops`,
  )

  return {
    target: { slug: target, display: nameOf(target), beancountName: beancount(fetched.get(target) ?? null) },
    amount: amount ?? null,
    nodes,
    edges,
    notes,
  }
}

// ── ledger holdings overlay ──────────────────────────────────────────────────
// Match each node's beancountName against the user's ledger accounts to mark
// what they already hold and attach the current balance. Currencies live under
// `Assets:Rewards:…:<beancountName>` (matched on the leaf segment); cards live
// under `Liabilities:CreditCards:<issuer>:<beancountName>[:<id>]`.

export type BalanceRow = { account: string; currency: string; scale: number; balance_scaled: number }

const leafOf = (account: string) => account.slice(account.lastIndexOf(':') + 1)

function matchAccount(node: PathNode, account: string): boolean {
  if (!node.beancountName) return false
  const parts = account.split(':')
  if (node.kind === 'card') {
    if (parts[0] !== 'Liabilities' || parts[1] !== 'CreditCards') return false
    if (node.issuer && parts[2] !== node.issuer) return false
    return parts[3] === node.beancountName
  }
  // target / currency: a points (or status) leaf under Assets:Rewards
  return parts[0] === 'Assets' && parts[1] === 'Rewards' && leafOf(account) === node.beancountName
}

export function applyHoldings(
  result: PointsPathsResult,
  accounts: ReadonlyArray<{ account: string }>,
  balances: ReadonlyArray<BalanceRow>,
): void {
  for (const node of result.nodes) {
    if (node.fiat) continue // fiat is conceptually held; never a ledger balance
    if (!node.beancountName) continue
    const held = accounts.some((a) => matchAccount(node, a.account))
    const rows = balances.filter((b) => matchAccount(node, b.account))
    if (!held && rows.length === 0) continue
    node.held = true
    if (rows.length) {
      node.balance = rows.reduce((sum, r) => sum + Number(r.balance_scaled) / 10 ** r.scale, 0)
      node.balanceCurrency = rows[0].currency
    } else {
      node.balance = 0
    }
  }
}

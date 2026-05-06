import type { TransactionInput } from '@/durable/ledger-types'
import { accountMatchesPrefix } from '@/lib/beancount/scope'
import type { CardSpec } from './card-decorations'
import type {
  OverviewViewProps,
  TrendPoint,
  CompositionRow,
  EventRow,
  TreemapNode,
  SankeyDatum,
} from './overview-view'

export type Period = 'All time' | '12M' | 'YTD' | '3M' | '1M'

const CURRENCY_META: Record<string, { symbol: string; locale: string }> = {
  INR: { symbol: '₹', locale: 'en-IN' },
  USD: { symbol: '$', locale: 'en-US' },
  EUR: { symbol: '€', locale: 'de-DE' },
  GBP: { symbol: '£', locale: 'en-GB' },
}

function fmtSymbol(currency: string): string {
  return CURRENCY_META[currency]?.symbol ?? ''
}

function fmtAmount(n: number, currency: string): string {
  const meta = CURRENCY_META[currency]
  return new Intl.NumberFormat(meta?.locale ?? 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n))
}

function fmtSigned(n: number, currency: string): string {
  const sym = fmtSymbol(currency)
  if (n === 0) return `${sym}0.00`
  const sign = n < 0 ? '−' : '+'
  return `${sign}${sym}${fmtAmount(n, currency)}`
}

function fmtUnsignedWithSymbol(n: number, currency: string): string {
  const sign = n < 0 ? '-' : ''
  return `${sign}${fmtSymbol(currency)}${fmtAmount(n, currency)}`
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function ymKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function parseYMD(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const da = Number(m[3])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(da)) return null
  return new Date(Date.UTC(y, mo, da))
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
}

function periodStart(now: Date, period: Period, earliest: Date): Date {
  switch (period) {
    case '1M':
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, now.getUTCDate()))
    case '3M':
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, now.getUTCDate()))
    case 'YTD':
      return new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
    case '12M':
      return new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()))
    case 'All time':
    default:
      return earliest
  }
}

type TxnFact = {
  date: Date
  ymd: string
  payee: string
  narration: string
  net: number
  abs: number
  flow: 'in' | 'out' | 'flat'
  counterparties: { account: string; amount: number }[]
  boundPostings: { account: string; amount: number }[]
  runningAfter: number
}

function txnFacts(
  transactions: TransactionInput[],
  cardSpecs: CardSpec[],
  entries: { kind: 'transaction' | 'directive'; index: number }[],
  account: string,
  currency: string,
): TxnFact[] {
  const facts: TxnFact[] = []
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!
    if (e.kind !== 'transaction') continue
    const tx = transactions[e.index]
    if (!tx) continue
    const spec = cardSpecs[i]
    if (!spec) continue
    const date = parseYMD(tx.date)
    if (!date) continue
    let net = 0
    const counterparties: { account: string; amount: number }[] = []
    const boundPostings: { account: string; amount: number }[] = []
    for (const p of tx.postings) {
      if (p.amount == null || p.currency !== currency) continue
      const v = Number(p.amount)
      if (!Number.isFinite(v)) continue
      if (accountMatchesPrefix(p.account, account)) {
        net += v
        boundPostings.push({ account: p.account, amount: v })
      } else {
        counterparties.push({ account: p.account, amount: v })
      }
    }
    const flow = net > 0 ? 'in' : net < 0 ? 'out' : 'flat'
    facts.push({
      date,
      ymd: tx.date,
      payee: tx.payee ?? '',
      narration: tx.narration ?? '',
      net,
      abs: Math.abs(net),
      flow,
      counterparties,
      boundPostings,
      runningAfter: spec.runningTotal ?? 0,
    })
  }
  facts.sort((a, b) => a.date.getTime() - b.date.getTime())
  return facts
}

function buildTrend(
  facts: TxnFact[],
  windowStart: Date,
  windowEnd: Date,
  currency: string,
): { points: TrendPoint[]; highlightIndex: number } {
  if (facts.length === 0) {
    return { points: [], highlightIndex: -1 }
  }
  const lastByMonth = new Map<string, { date: Date; runningAfter: number }>()
  for (const f of facts) {
    lastByMonth.set(ymKey(f.date), { date: f.date, runningAfter: f.runningAfter })
  }
  const months: { date: Date; balance: number }[] = []
  const startMonth = startOfMonth(windowStart)
  const endMonth = startOfMonth(windowEnd)
  let lastSeen = 0
  const allMonthsByKey: { key: string; date: Date }[] = []
  {
    let cursor = startOfMonth(facts[0]!.date)
    while (cursor.getTime() <= endMonth.getTime()) {
      allMonthsByKey.push({ key: ymKey(cursor), date: new Date(cursor) })
      cursor = addMonths(cursor, 1)
    }
  }
  for (const { key, date } of allMonthsByKey) {
    const last = lastByMonth.get(key)
    if (last) lastSeen = last.runningAfter
    if (date.getTime() < startMonth.getTime()) continue
    months.push({ date, balance: lastSeen })
  }
  const points: TrendPoint[] = months.map((m) => {
    const monthAbbr = MONTH_ABBR[m.date.getUTCMonth()]!
    const yr = String(m.date.getUTCFullYear()).slice(-2)
    // Always include year so windows that straddle two of the same month
    // (e.g. Apr 25 + Apr 26 in a 12-month window) don't collide on x.
    const x = `${monthAbbr} ${yr}`
    return {
      x,
      y: m.balance,
      label: `${monthAbbr} ${yr} · ${fmtUnsignedWithSymbol(m.balance, currency)}`,
    }
  })
  const highlightIndex = points.length - 1
  return { points, highlightIndex }
}

function leafOf(account: string): { prefix: string; leaf: string } {
  const parts = account.split(':')
  if (parts.length <= 1) return { prefix: '', leaf: account }
  const leaf = parts[parts.length - 1]!
  const prefix = parts.slice(0, -1).join(':') + ':'
  return { prefix, leaf }
}

function buildComposition(
  facts: TxnFact[],
  currency: string,
): { rows: CompositionRow[]; moreCount: number } {
  const totals = new Map<string, number>()
  for (const f of facts) {
    for (const cp of f.counterparties) {
      totals.set(cp.account, (totals.get(cp.account) ?? 0) + cp.amount)
    }
  }
  const sorted = [...totals.entries()]
    .map(([account, amount]) => ({ account, amount, abs: Math.abs(amount) }))
    .sort((a, b) => b.abs - a.abs)
  const top = sorted.slice(0, 6)
  const moreCount = Math.max(0, sorted.length - top.length)
  const maxAbs = top[0]?.abs ?? 1
  const rows: CompositionRow[] = top.map(({ account, amount, abs }) => {
    const { prefix, leaf } = leafOf(account)
    const sign = amount < 0 ? '−' : '+'
    const amountStr = `${sign}${fmtSymbol(currency)}${fmtAmount(amount, currency)}`
    return {
      prefix,
      leaf,
      amount: amountStr,
      amountClass: amount < 0 ? 'text-rose-600' : 'text-slate-900',
      scale: Math.max(0.04, abs / Math.max(maxAbs, 1)),
    }
  })
  return { rows, moreCount }
}

// Monthly spend: per month, sum of charges (negative postings on the CC).
// Payments are excluded — they belong on the "Paid from" card. Values are
// returned as positive numbers (the spend amount) so the chart never crosses
// zero. Returns one point per month in the window with a human-readable
// total label.
function buildMonthlyNet(
  facts: TxnFact[],
  windowStart: Date,
  windowEnd: Date,
  currency: string,
): { points: TrendPoint[]; totalLabel: string } {
  if (facts.length === 0) {
    return { points: [], totalLabel: `${fmtSymbol(currency)}${fmtAmount(0, currency)}` }
  }
  const sumByMonth = new Map<string, number>()
  let total = 0
  for (const f of facts) {
    if (f.date.getTime() < windowStart.getTime()) continue
    if (f.date.getTime() > windowEnd.getTime()) continue
    if (f.net >= 0) continue
    const k = ymKey(f.date)
    const spend = -f.net
    sumByMonth.set(k, (sumByMonth.get(k) ?? 0) + spend)
    total += spend
  }
  const points: TrendPoint[] = []
  let cursor = startOfMonth(windowStart)
  const endMonth = startOfMonth(windowEnd)
  while (cursor.getTime() <= endMonth.getTime()) {
    const k = ymKey(cursor)
    const monthAbbr = MONTH_ABBR[cursor.getUTCMonth()]!
    const yr = String(cursor.getUTCFullYear()).slice(-2)
    const x = `${monthAbbr} ${yr}`
    const y = sumByMonth.get(k) ?? 0
    points.push({
      x,
      y,
      label: `${monthAbbr} ${yr} · ${fmtSymbol(currency)}${fmtAmount(y, currency)}`,
    })
    cursor = addMonths(cursor, 1)
  }
  return { points, totalLabel: `${fmtSymbol(currency)}${fmtAmount(total, currency)}` }
}

// Category breakdown: for each charge transaction (net < 0 on the CC =
// balance grew worse), sum the Expenses:* counter-postings grouped by their
// root category (Expenses:Root). Returns top 6 with relative scale.
function buildCategoryBreakdown(
  facts: TxnFact[],
  currency: string,
): { rows: CompositionRow[]; moreCount: number } {
  const totals = new Map<string, number>()
  for (const f of facts) {
    if (f.net >= 0) continue
    for (const cp of f.counterparties) {
      if (!cp.account.startsWith('Expenses:')) continue
      const parts = cp.account.split(':')
      const rootCat = parts.length >= 2 ? `${parts[0]}:${parts[1]}` : cp.account
      totals.set(rootCat, (totals.get(rootCat) ?? 0) + cp.amount)
    }
  }
  const sorted = [...totals.entries()]
    .map(([account, amount]) => ({ account, amount, abs: Math.abs(amount) }))
    .sort((a, b) => b.abs - a.abs)
  const top = sorted.slice(0, 6)
  const moreCount = Math.max(0, sorted.length - top.length)
  const maxAbs = top[0]?.abs ?? 1
  const rows: CompositionRow[] = top.map(({ account, amount, abs }) => {
    const { prefix, leaf } = leafOf(account)
    return {
      prefix,
      leaf,
      amount: `${fmtSymbol(currency)}${fmtAmount(amount, currency)}`,
      amountClass: 'text-slate-900',
      scale: Math.max(0.04, abs / Math.max(maxAbs, 1)),
      value: abs,
    }
  })
  return { rows, moreCount }
}

// Paid-from: for each payment transaction (net > 0 on the CC = balance grew
// better), sum the Assets:* counter-postings grouped by full account path.
// Returns top 4 with relative scale.
function buildPaidFrom(
  facts: TxnFact[],
  currency: string,
): { rows: CompositionRow[] } {
  const totals = new Map<string, number>()
  for (const f of facts) {
    if (f.net <= 0) continue
    for (const cp of f.counterparties) {
      if (!cp.account.startsWith('Assets:')) continue
      totals.set(cp.account, (totals.get(cp.account) ?? 0) + cp.amount)
    }
  }
  const sorted = [...totals.entries()]
    .map(([account, amount]) => ({ account, amount, abs: Math.abs(amount) }))
    .sort((a, b) => b.abs - a.abs)
    .slice(0, 4)
  const maxAbs = sorted[0]?.abs ?? 1
  const rows: CompositionRow[] = sorted.map(({ account, amount, abs }) => {
    const { prefix, leaf } = leafOf(account)
    return {
      prefix,
      leaf,
      amount: `${fmtSymbol(currency)}${fmtAmount(amount, currency)}`,
      amountClass: 'text-slate-900',
      scale: Math.max(0.06, abs / Math.max(maxAbs, 1)),
      value: abs,
    }
  })
  return { rows }
}

// Cards-used: at parent CC views (e.g. Liabilities:CreditCards or
// Liabilities:CreditCards:HSBC), split charge volume by the specific
// child CC account. Returns empty rows when only one CC is present so
// leaf views suppress the card.
function buildCardsUsed(
  facts: TxnFact[],
  boundPrefix: string,
  currency: string,
): { rows: CompositionRow[] } {
  const totals = new Map<string, number>()
  for (const f of facts) {
    for (const p of f.boundPostings) {
      if (p.amount >= 0) continue
      totals.set(p.account, (totals.get(p.account) ?? 0) + Math.abs(p.amount))
    }
  }
  if (totals.size === 0) return { rows: [] }
  const sorted = [...totals.entries()]
    .map(([account, amount]) => ({ account, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6)
  const maxAbs = sorted[0]?.amount ?? 1
  const rows: CompositionRow[] = sorted.map(({ account, amount }) => {
    // Display the sub-path relative to the bound prefix as the leaf so
    // legends read e.g. "HSBC:Cashback:9065" rather than just "9065".
    const sub = account.startsWith(`${boundPrefix}:`)
      ? account.slice(boundPrefix.length + 1)
      : account
    return {
      prefix: account.startsWith(`${boundPrefix}:`) ? `${boundPrefix}:` : '',
      leaf: sub,
      amount: `${fmtSymbol(currency)}${fmtAmount(amount, currency)}`,
      amountClass: 'text-slate-900',
      scale: Math.max(0.04, amount / Math.max(maxAbs, 1)),
      value: amount,
    }
  })
  return { rows }
}

function buildEvents(facts: TxnFact[], currency: string): EventRow[] {
  const ranked = [...facts]
    .filter((f) => f.abs > 0)
    .sort((a, b) => b.abs - a.abs)
    .slice(0, 5)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
  return ranked.map((f) => ({
    date: f.ymd,
    payee: f.payee || '—',
    narration: f.narration || '',
    amount: fmtSigned(f.net, currency),
    amountClass: f.net < 0 ? 'text-rose-600' : 'text-slate-900',
  }))
}

// Two-level hierarchy of expense spend.
//
// For an Expenses-bound view (account starts with 'Expenses'): walk each
// transaction's boundPostings (all under the bound prefix), group at one
// level deeper than the bound, list leaves within. Refunds (negative
// boundPostings on a debit-normal Expenses account) are skipped.
//
// For any other bound view (e.g. a credit card): walk counterparties,
// filter to Expenses:*, group by depth=2 (e.g. 'Expenses:Travel'), list
// the full leaf accounts within. On a debit-normal Expenses leg the
// counterparty amount is positive when the user spent money.
function buildCategoryTreemap(
  facts: TxnFact[],
  account: string,
  currency: string,
): TreemapNode | undefined {
  const boundIsExpenses = accountMatchesPrefix(account, 'Expenses')

  const leafTotals = new Map<string, number>()
  if (boundIsExpenses) {
    for (const f of facts) {
      for (const p of f.boundPostings) {
        if (p.amount <= 0) continue
        leafTotals.set(p.account, (leafTotals.get(p.account) ?? 0) + p.amount)
      }
    }
  } else {
    for (const f of facts) {
      for (const cp of f.counterparties) {
        if (!cp.account.startsWith('Expenses:')) continue
        if (cp.amount <= 0) continue
        leafTotals.set(cp.account, (leafTotals.get(cp.account) ?? 0) + cp.amount)
      }
    }
  }
  if (leafTotals.size === 0) return undefined

  const groupDepth = boundIsExpenses ? account.split(':').length + 1 : 2

  const groups = new Map<string, { account: string; amount: number }[]>()
  for (const [acct, amt] of leafTotals) {
    const parts = acct.split(':')
    if (parts.length < groupDepth) continue
    const groupKey = parts.slice(0, groupDepth).join(':')
    if (!groups.has(groupKey)) groups.set(groupKey, [])
    groups.get(groupKey)!.push({ account: acct, amount: amt })
  }
  if (groups.size === 0) return undefined

  const groupNodes = [...groups.entries()]
    .map(([groupKey, leaves]) => ({
      groupKey,
      leaves,
      total: leaves.reduce((s, x) => s + x.amount, 0),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)

  const rootName = boundIsExpenses ? (account.split(':').pop() ?? account) : 'Expenses'

  return {
    name: rootName,
    children: groupNodes.map(({ groupKey, leaves }) => ({
      name: groupKey.split(':').pop() ?? groupKey,
      children: leaves
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8)
        .map(({ account: leafAcct, amount }) => {
          const tail = leafAcct.split(':').slice(groupDepth).join(':')
          const leafName = tail || (leafAcct.split(':').pop() ?? leafAcct)
          return {
            name: leafName,
            value: amount,
            amount: `${fmtSymbol(currency)}${fmtAmount(amount, currency)}`,
          }
        }),
    })),
  }
}

// Sankey for the CC view: payment-source accounts → individual card
// accounts → top-level expense categories. The middle column splits one
// node per CC account so a parent-bound view (e.g. Liabilities:CreditCards
// or Liabilities:CreditCards:HDFC) shows each card distinctly. Top 9
// middle / 6 source / 6 category nodes survive; the rest fold into an
// 'Other ...' bucket on their side. Returns undefined when either the
// source or category side is empty.
//
// Per fact, counterparties are attributed to bound postings on the same
// side: when a single charge txn touches both HDFC:Infinia and
// ICICI:Amazon, each Expenses counterparty is split between them in
// proportion to each card's share of the txn's signed bound total. In the
// common case of one bound posting per side this is just full attribution.
function buildCardSankey(
  facts: TxnFact[],
  account: string,
  currency: string,
): SankeyDatum | undefined {
  if (accountMatchesPrefix(account, 'Expenses')) return undefined

  const sourceLinks = new Map<string, number>() // "srcAcct||midAcct"
  const categoryLinks = new Map<string, number>() // "midAcct||catRoot"
  const sourceTotals = new Map<string, number>()
  const categoryTotals = new Map<string, number>()
  const middleTotals = new Map<string, number>()

  for (const f of facts) {
    let totalIn = 0
    let totalOut = 0
    for (const bp of f.boundPostings) {
      if (bp.amount > 0) totalIn += bp.amount
      else if (bp.amount < 0) totalOut += -bp.amount
    }
    if (totalIn > 0) {
      for (const cp of f.counterparties) {
        if (!cp.account.startsWith('Assets:')) continue
        if (cp.amount >= 0) continue
        const cpVal = -cp.amount
        for (const bp of f.boundPostings) {
          if (bp.amount <= 0) continue
          const portion = (bp.amount / totalIn) * cpVal
          if (portion <= 0) continue
          const k = `${cp.account}||${bp.account}`
          sourceLinks.set(k, (sourceLinks.get(k) ?? 0) + portion)
          sourceTotals.set(cp.account, (sourceTotals.get(cp.account) ?? 0) + portion)
          middleTotals.set(bp.account, (middleTotals.get(bp.account) ?? 0) + portion)
        }
      }
    }
    if (totalOut > 0) {
      for (const cp of f.counterparties) {
        if (!cp.account.startsWith('Expenses:')) continue
        if (cp.amount <= 0) continue
        const parts = cp.account.split(':')
        const rootCat = parts.length >= 2 ? `${parts[0]}:${parts[1]}` : cp.account
        for (const bp of f.boundPostings) {
          if (bp.amount >= 0) continue
          const portion = (-bp.amount / totalOut) * cp.amount
          if (portion <= 0) continue
          const k = `${bp.account}||${rootCat}`
          categoryLinks.set(k, (categoryLinks.get(k) ?? 0) + portion)
          categoryTotals.set(rootCat, (categoryTotals.get(rootCat) ?? 0) + portion)
          middleTotals.set(bp.account, (middleTotals.get(bp.account) ?? 0) + portion)
        }
      }
    }
  }
  if (sourceTotals.size === 0 || categoryTotals.size === 0) return undefined
  if (middleTotals.size === 0) return undefined

  // Pick top-N keys; leftover keys map to a single 'other' label.
  const collapseTopN = (
    totals: Map<string, number>,
    topN: number,
    label: (k: string) => string,
    otherLabel: string,
  ): { resolved: Map<string, string>; orderedNames: string[] } => {
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])
    const top = sorted.slice(0, topN)
    const rest = sorted.slice(topN)
    const resolved = new Map<string, string>()
    for (const [k] of top) resolved.set(k, label(k))
    for (const [k] of rest) resolved.set(k, otherLabel)
    const seen = new Set<string>()
    const orderedNames: string[] = []
    for (const [k] of top) {
      const n = resolved.get(k)!
      if (!seen.has(n)) {
        seen.add(n)
        orderedNames.push(n)
      }
    }
    if (rest.length > 0) orderedNames.push(otherLabel)
    return { resolved, orderedNames }
  }

  const srcLabel = (acct: string) => {
    const parts = acct.split(':')
    return parts.length <= 2 ? acct : parts.slice(-2).join(':')
  }
  const midLabel = (acct: string) => {
    if (acct.startsWith(`${account}:`)) return acct.slice(account.length + 1)
    return acct.split(':').pop() ?? acct
  }
  const catLabel = (acct: string) => acct.split(':').pop() ?? acct

  const sources = collapseTopN(sourceTotals, 6, srcLabel, 'Other')
  const middles = collapseTopN(middleTotals, 9, midLabel, 'Other cards')
  const categories = collapseTopN(categoryTotals, 6, catLabel, 'Other')

  const nodes: SankeyDatum['nodes'] = []
  const sIdx = new Map<string, number>()
  const mIdx = new Map<string, number>()
  const cIdx = new Map<string, number>()
  for (const name of sources.orderedNames) {
    sIdx.set(name, nodes.length)
    nodes.push({ name, side: 'source' })
  }
  for (const name of middles.orderedNames) {
    mIdx.set(name, nodes.length)
    nodes.push({ name, side: 'card' })
  }
  for (const name of categories.orderedNames) {
    cIdx.set(name, nodes.length)
    nodes.push({ name, side: 'category' })
  }

  const aggSrc = new Map<string, number>()
  for (const [k, v] of sourceLinks) {
    const [s, m] = k.split('||') as [string, string]
    const sn = sources.resolved.get(s) ?? 'Other'
    const mn = middles.resolved.get(m) ?? 'Other cards'
    const key = `${sn}||${mn}`
    aggSrc.set(key, (aggSrc.get(key) ?? 0) + v)
  }
  const aggCat = new Map<string, number>()
  for (const [k, v] of categoryLinks) {
    const [m, c] = k.split('||') as [string, string]
    const mn = middles.resolved.get(m) ?? 'Other cards'
    const cn = categories.resolved.get(c) ?? 'Other'
    const key = `${mn}||${cn}`
    aggCat.set(key, (aggCat.get(key) ?? 0) + v)
  }

  const links: SankeyDatum['links'] = []
  for (const [k, v] of aggSrc) {
    const [sn, mn] = k.split('||') as [string, string]
    const s = sIdx.get(sn)
    const m = mIdx.get(mn)
    if (s == null || m == null) continue
    links.push({
      source: s,
      target: m,
      value: v,
      amount: `${fmtSymbol(currency)}${fmtAmount(v, currency)}`,
    })
  }
  for (const [k, v] of aggCat) {
    const [mn, cn] = k.split('||') as [string, string]
    const m = mIdx.get(mn)
    const c = cIdx.get(cn)
    if (m == null || c == null) continue
    links.push({
      source: m,
      target: c,
      value: v,
      amount: `${fmtSymbol(currency)}${fmtAmount(v, currency)}`,
    })
  }
  return { nodes, links }
}

export function deriveOverview(args: {
  cardSpecs: CardSpec[]
  transactions: TransactionInput[]
  entries: { kind: 'transaction' | 'directive'; index: number }[]
  account: string
  currency: string
  period: Period
}): OverviewViewProps {
  const { cardSpecs, transactions, entries, account, currency, period } = args
  const facts = txnFacts(transactions, cardSpecs, entries, account, currency)
  if (facts.length === 0) {
    return {
      kpis: [
        { label: 'Balance', value: `${fmtSymbol(currency)}0.00`, caption: 'no activity' },
        { label: `Net change · ${period}`, value: fmtSigned(0, currency) },
        { label: 'Activity', value: '0', caption: 'transactions' },
      ],
      trend: { title: 'Balance over time', currency, points: [], highlightIndex: -1 },
      composition: { title: 'Top counter-accounts', rows: [], moreCount: 0 },
      events: { title: 'Notable events', rows: [] },
    }
  }
  const earliest = facts[0]!.date
  const latest = facts[facts.length - 1]!.date
  const now = latest
  const start = periodStart(now, period, earliest)
  const inWindow = facts.filter((f) => f.date.getTime() >= start.getTime())
  const balance = facts[facts.length - 1]!.runningAfter
  const balanceBefore = (() => {
    const prior = facts.filter((f) => f.date.getTime() < start.getTime())
    return prior.length ? prior[prior.length - 1]!.runningAfter : 0
  })()
  const netChange = balance - balanceBefore
  let netIn = 0
  let netOut = 0
  for (const f of inWindow) {
    if (f.flow === 'in') netIn += f.net
    else if (f.flow === 'out') netOut += f.net
  }
  const trend = buildTrend(facts, start, now, currency)
  const composition = buildComposition(inWindow, currency)
  const events = buildEvents(inWindow, currency)
  const monthlyNet = buildMonthlyNet(facts, start, now, currency)
  const categoryBreakdown = buildCategoryBreakdown(inWindow, currency)
  const paidFrom = buildPaidFrom(inWindow, currency)
  const cardsUsed = buildCardsUsed(inWindow, account, currency)
  const categoryTreemap = buildCategoryTreemap(inWindow, account, currency)
  const cardSankey = buildCardSankey(inWindow, account, currency)
  return {
    kpis: [
      {
        label: 'Balance',
        value: fmtUnsignedWithSymbol(balance, currency),
        caption: `as of ${facts[facts.length - 1]!.ymd}`,
      },
      {
        label: `Net change · ${period}`,
        value: fmtSigned(netChange, currency),
        valueClass: netChange < 0 ? 'text-rose-600' : 'text-[#00685f]',
      },
      {
        label: 'Activity',
        value: String(inWindow.length),
        caption: `${fmtSigned(netIn, currency)} in · ${fmtSigned(netOut, currency)} out`,
      },
    ],
    trend: { title: 'Balance over time', currency, ...trend },
    composition: { title: 'Top counter-accounts', rows: composition.rows, moreCount: composition.moreCount },
    events: { title: 'Notable events', rows: events },
    monthlyNet: { points: monthlyNet.points, totalLabel: monthlyNet.totalLabel, currency },
    categoryBreakdown: { rows: categoryBreakdown.rows, moreCount: categoryBreakdown.moreCount },
    paidFrom: { rows: paidFrom.rows },
    cardsUsed: { rows: cardsUsed.rows },
    categoryTreemap,
    cardSankey,
  }
}

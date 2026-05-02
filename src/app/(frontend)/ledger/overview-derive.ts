import type { TransactionInput } from '@/durable/ledger-types'
import { accountMatchesPrefix } from '@/lib/beancount/scope'
import type { CardSpec } from './card-decorations'
import type { OverviewViewProps, TrendPoint, CompositionRow, EventRow } from './overview-view'

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
    for (const p of tx.postings) {
      if (p.amount == null || p.currency !== currency) continue
      const v = Number(p.amount)
      if (!Number.isFinite(v)) continue
      if (accountMatchesPrefix(p.account, account)) {
        net += v
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
    const x = m.date.getUTCMonth() === 0 ? `${monthAbbr} ${yr}` : monthAbbr
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

export function deriveOverview(args: {
  cardSpecs: CardSpec[]
  transactions: TransactionInput[]
  entries: { kind: 'transaction' | 'directive'; index: number }[]
  account: string
  currency: string
  period: Period
  caption: string
}): OverviewViewProps {
  const { cardSpecs, transactions, entries, account, currency, period, caption } = args
  const facts = txnFacts(transactions, cardSpecs, entries, account, currency)
  if (facts.length === 0) {
    return {
      caption,
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
  return {
    caption,
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
  }
}

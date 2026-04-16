import { parse, BeancountParseError, type Posting } from 'beancount'

import { groupPostings } from './posting-grouping'

export type ValidationDiagnostic = {
  severity: 'error'
  message: string
  transactionIndex?: number
  line?: { startLine: number; endLine: number }
}

const BALANCE_TOLERANCE = 0.005

function formatAmount(n: number): string {
  return Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2)
}

type Weight = { n: number; ccy: string }

function postingWeight(p: Posting): Weight | null {
  if (p.amount == null || !p.currency) return null
  const n = parseFloat(p.amount)
  if (!Number.isFinite(n)) return null
  if (p.priceAmount != null && p.priceCurrency) {
    const pn = parseFloat(p.priceAmount)
    if (!Number.isFinite(pn)) return null
    if (p.atSigns === 2) {
      const sign = n < 0 ? -1 : 1
      return { n: sign * pn, ccy: p.priceCurrency }
    }
    return { n: n * pn, ccy: p.priceCurrency }
  }
  return { n, ccy: p.currency }
}

function sumByCommodity(
  postings: readonly Posting[],
  predicate: (p: Posting) => boolean,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of postings) {
    if (!predicate(p)) continue
    if (!p.currency || p.amount == null) continue
    const n = parseFloat(p.amount)
    if (!Number.isFinite(n)) continue
    out[p.currency] = (out[p.currency] ?? 0) + n
  }
  return out
}

function pushBalance(
  push: (msg: string) => void,
  postings: readonly Posting[],
) {
  const sums = new Map<string, number>()
  let elided = 0
  for (const p of postings) {
    if (p.amount == null) {
      elided += 1
      continue
    }
    const w = postingWeight(p)
    if (w == null) continue
    sums.set(w.ccy, (sums.get(w.ccy) ?? 0) + w.n)
  }
  if (elided > 1) {
    push('At most one posting may have an elided amount.')
    return
  }
  const unbalanced = [...sums].filter(([, v]) => Math.abs(v) > BALANCE_TOLERANCE)
  if (elided === 1) {
    if (unbalanced.length !== 1) {
      push(
        `Cannot auto-balance elided posting: need exactly one unbalanced commodity, found ${unbalanced.length}.`,
      )
    }
    return
  }
  if (unbalanced.length > 0) {
    const detail = unbalanced.map(([c, v]) => `${c}=${formatAmount(v)}`).join(', ')
    push(`Unbalanced transaction: ${detail}.`)
  }
}

function pushSymmetricPair(
  push: (msg: string) => void,
  postings: readonly Posting[],
  label: string,
  aPrefix: string,
  bPrefix: string,
  aSuffix = '',
  aPredicate?: (p: Posting) => boolean,
) {
  const aSums = sumByCommodity(
    postings,
    aPredicate ?? ((p) => p.account.startsWith(aPrefix)),
  )
  const bSums = sumByCommodity(postings, (p) => p.account.startsWith(bPrefix))
  const hasA = Object.keys(aSums).length > 0
  const hasB = Object.keys(bSums).length > 0
  if (!hasA && !hasB) return
  if (!hasA) {
    push(`${label}: ${bPrefix}* needs a matching ${aPrefix}* reverse entry.`)
    return
  }
  if (!hasB) {
    push(`${label}: ${aPrefix}*${aSuffix} needs a matching ${bPrefix}* reverse entry.`)
    return
  }
  const commodities = new Set([...Object.keys(aSums), ...Object.keys(bSums)])
  for (const c of commodities) {
    const a = aSums[c] ?? 0
    const b = bSums[c] ?? 0
    if (Math.abs(a + b) > BALANCE_TOLERANCE) {
      push(
        `${label} ${c} mismatch: ${aPrefix}* = ${formatAmount(a)}, ${bPrefix}* = ${formatAmount(b)} (must cancel out).`,
      )
    }
  }
}

export function validateBeancount(source: string): ValidationDiagnostic[] {
  if (!source.trim()) {
    return [{ severity: 'error', message: 'Empty input.' }]
  }

  try {
    const result = parse(source)
    if (result.transactions.length === 0) {
      return [
        {
          severity: 'error',
          message:
            'No transaction recognized. Check the date (YYYY-MM-DD), flag (* or !), and posting indentation.',
        },
      ]
    }

    const errors: ValidationDiagnostic[] = []
    for (let i = 0; i < result.transactions.length; i++) {
      const t = result.transactions[i]
      const push = (msg: string) =>
        errors.push({ severity: 'error', message: msg, transactionIndex: i })

      if (t.links.size === 0) {
        push('Transaction must have at least one link (e.g. ^receipt-1234).')
      }

      pushBalance(push, t.postings)

      const groups = groupPostings(t.postings)
      const pairIndices = new Set<number>()
      for (const g of groups) {
        if (g.kind === 'points-transfer') {
          pairIndices.add(g.sourceIndex)
          pairIndices.add(g.sinkIndex)
        } else if (g.kind === 'transfer') {
          pairIndices.add(g.fromIndex)
          pairIndices.add(g.toIndex)
        }
      }
      const nonPaired = t.postings.filter((_, idx) => !pairIndices.has(idx))

      pushSymmetricPair(
        push,
        t.postings,
        'Cashback',
        'Assets:Cashback:Pending:',
        'Income:Cashback:',
      )

      pushSymmetricPair(
        push,
        nonPaired,
        'Reward',
        'Assets:Rewards:',
        'Income:Rewards:',
        ' (earn)',
        (p) =>
          p.account.startsWith('Assets:Rewards:') &&
          p.amount != null &&
          parseFloat(p.amount) > 0,
      )

      for (let idx = 0; idx < t.postings.length; idx++) {
        if (pairIndices.has(idx)) continue
        const p = t.postings[idx]
        if (!p.account.startsWith('Assets:Rewards:')) continue
        const n = p.amount != null ? parseFloat(p.amount) : NaN
        if (!Number.isFinite(n) || n >= 0) continue
        if (!p.priceCurrency || !p.priceAmount || p.priceCurrency === p.currency) {
          push(
            `Redemption: ${p.account} must convert via @@/@ price clause to a real currency.`,
          )
        }
      }

      for (const g of groups) {
        if (g.kind !== 'points-transfer') continue
        const srcRaw = g.source.amount != null ? parseFloat(g.source.amount) : NaN
        const sinkRaw = g.sink.amount != null ? parseFloat(g.sink.amount) : NaN
        if (Number.isFinite(srcRaw) && srcRaw >= 0) {
          push(
            `Points transfer: ${g.source.account} must be negative (the program you're drawing points from).`,
          )
        }
        if (Number.isFinite(sinkRaw) && sinkRaw <= 0) {
          push(
            `Points transfer: ${g.sink.account} must be positive (the program receiving points).`,
          )
        }
      }
    }
    return errors
  } catch (err) {
    if (err instanceof BeancountParseError) {
      return [
        {
          severity: 'error',
          message: err.message,
          line: { startLine: err.location.startLine, endLine: err.location.endLine },
        },
      ]
    }
    return [
      { severity: 'error', message: err instanceof Error ? err.message : String(err) },
    ]
  }
}

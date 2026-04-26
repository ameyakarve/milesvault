import {
  ParseResult,
  Posting as BcPosting,
  Tag as BcTag,
  Transaction as BcTransaction,
  Value,
} from 'beancount'
import type { PostingInput, TransactionInput } from '@/durable/ledger-v2-types'

const ACCOUNT_RE = /^[A-Z][A-Za-z0-9-]*(:[A-Z][A-Za-z0-9-]*)+$/
const DECIMAL_RE = /^-?\d+(\.\d+)?$/
const CURRENCY_RE = /^[A-Z][A-Z0-9'._-]{0,22}[A-Z0-9]$|^[A-Z]$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TAG_RE = /^[A-Za-z0-9-_/]+$/
const LINK_RE = /^[A-Za-z0-9-_/.]+$/

export function validateInput(input: TransactionInput): string[] {
  const errs: string[] = []
  if (!DATE_RE.test(input.date)) errs.push(`date must match YYYY-MM-DD: '${input.date}'`)
  if (input.flag != null && input.flag !== '*' && input.flag !== '!') {
    errs.push(`flag must be '*' or '!' (got '${input.flag}')`)
  }
  if (!Array.isArray(input.postings) || input.postings.length < 2) {
    errs.push('at least 2 postings are required')
  }
  for (const t of input.tags ?? []) {
    if (!TAG_RE.test(t)) errs.push(`invalid tag '${t}'`)
  }
  for (const l of input.links ?? []) {
    if (!LINK_RE.test(l)) errs.push(`invalid link '${l}'`)
  }
  for (let i = 0; i < (input.postings ?? []).length; i++) {
    const p = input.postings[i]
    if (!ACCOUNT_RE.test(p.account)) {
      errs.push(`postings[${i}].account invalid: '${p.account}'`)
    }
    if (p.flag != null && p.flag !== '*' && p.flag !== '!') {
      errs.push(`postings[${i}].flag must be '*' or '!' (got '${p.flag}')`)
    }
    if (p.amount != null && !DECIMAL_RE.test(p.amount)) {
      errs.push(`postings[${i}].amount must be a decimal string (got '${p.amount}')`)
    }
    if (p.currency != null && !CURRENCY_RE.test(p.currency)) {
      errs.push(`postings[${i}].currency invalid: '${p.currency}'`)
    }
    if ((p.amount == null) !== (p.currency == null)) {
      errs.push(`postings[${i}]: amount and currency must both be set or both be omitted`)
    }
    if (p.price_at_signs != null && ![0, 1, 2].includes(p.price_at_signs)) {
      errs.push(`postings[${i}].price_at_signs must be 0|1|2`)
    }
    if (p.price_amount != null && !DECIMAL_RE.test(p.price_amount)) {
      errs.push(`postings[${i}].price_amount must be a decimal string`)
    }
    if (p.price_currency != null && !CURRENCY_RE.test(p.price_currency)) {
      errs.push(`postings[${i}].price_currency invalid: '${p.price_currency}'`)
    }
  }

  if (errs.length === 0) {
    const totals = new Map<string, number>()
    let inferred = 0
    for (const p of input.postings) {
      if (p.amount == null || p.currency == null) {
        inferred += 1
        continue
      }
      const ccy = p.price_currency ?? p.currency
      const amt = Number(p.amount)
      const eff =
        p.price_amount != null
          ? p.price_at_signs === 2
            ? Number(p.price_amount) * Math.sign(amt)
            : Number(p.price_amount) * amt
          : amt
      totals.set(ccy, (totals.get(ccy) ?? 0) + eff)
    }
    if (inferred > 1) {
      errs.push('at most one posting may omit amount/currency (inferred)')
    } else if (inferred === 0) {
      for (const [ccy, sum] of totals) {
        if (Math.abs(sum) > 0.005) {
          errs.push(`postings do not balance for ${ccy}: sum=${sum.toFixed(4)}`)
        }
      }
    }
  }
  return errs
}

function metaToValueMap(
  meta: Record<string, string> | null | undefined,
): Record<string, Value> | undefined {
  if (!meta || Object.keys(meta).length === 0) return undefined
  const out: Record<string, Value> = {}
  for (const [k, v] of Object.entries(meta)) {
    out[k] = new Value({ type: 'string', value: v })
  }
  return out
}

function postingFromInput(p: PostingInput): BcPosting {
  return new BcPosting({
    flag: p.flag ?? undefined,
    account: p.account,
    amount: p.amount ?? undefined,
    currency: p.currency ?? undefined,
    cost: p.cost_raw ?? undefined,
    atSigns: p.price_at_signs && p.price_at_signs > 0 ? p.price_at_signs : undefined,
    priceAmount: p.price_amount ?? undefined,
    priceCurrency: p.price_currency ?? undefined,
    comment: p.comment ?? undefined,
    metadata: metaToValueMap(p.meta ?? null),
  })
}

export function buildTransactionAst(input: TransactionInput): BcTransaction {
  return new BcTransaction({
    date: input.date,
    payee: input.payee ?? '',
    narration: input.narration ?? undefined,
    flag: input.flag ?? undefined,
    postings: input.postings.map(postingFromInput),
    postingComments: [],
    tags: (input.tags ?? []).map(
      (t) => new BcTag({ content: t, fromStack: false }),
    ),
    links: new Set(input.links ?? []),
    metadata: metaToValueMap(input.meta ?? null),
  })
}

export function serializeTransaction(txn: BcTransaction): string {
  const result = new ParseResult([txn])
  const col = result.calculateCurrencyColumn({ minPadding: 2 })
  return result.toFormattedString({ currencyColumn: col }).trim() + '\n'
}


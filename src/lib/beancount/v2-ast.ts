import {
  ParseResult,
  Posting as BcPosting,
  Tag as BcTag,
  Transaction as BcTransaction,
  Value,
  parse,
} from 'beancount'
import type { PostingInput, TransactionInput } from '@/durable/ledger-v2-types'

const ACCOUNT_RE = /^[A-Z][A-Za-z0-9-]*(:[A-Z][A-Za-z0-9-]*)+$/
const DECIMAL_RE = /^-?\d+(\.\d+)?$/
const CURRENCY_RE = /^[A-Z][A-Z0-9'._-]{0,22}[A-Z0-9]$|^[A-Z]$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TAG_RE = /^[A-Za-z0-9-_/]+$/
const LINK_RE = /^[A-Za-z0-9-_/.]+$/

export function dateToInt(ymd: string): number {
  if (!DATE_RE.test(ymd)) throw new Error(`invalid date '${ymd}'`)
  return Number(ymd.replace(/-/g, ''))
}

export function dateFromInt(n: number): string {
  const s = String(n).padStart(8, '0')
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

export function scaleDecimal(s: string): { scaled: number; scale: number } {
  if (!DECIMAL_RE.test(s)) throw new Error(`invalid decimal '${s}'`)
  const dot = s.indexOf('.')
  const scale = dot === -1 ? 0 : s.length - dot - 1
  const big = BigInt(dot === -1 ? s : s.replace('.', ''))
  if (big > BigInt(Number.MAX_SAFE_INTEGER) || big < BigInt(-Number.MAX_SAFE_INTEGER)) {
    throw new Error(`scaled amount out of range for '${s}'`)
  }
  return { scaled: Number(big), scale }
}

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
    type Term = { ccy: string; scaled: bigint; scale: number }
    const terms: Term[] = []
    let inferred = 0
    try {
      for (const p of input.postings) {
        if (p.amount == null || p.currency == null) {
          inferred += 1
          continue
        }
        const amt = scaleDecimal(p.amount)
        const ccy = p.price_currency ?? p.currency
        if (p.price_amount != null) {
          const px = scaleDecimal(p.price_amount)
          if (p.price_at_signs === 2) {
            const sign = amt.scaled === 0 ? 0n : amt.scaled > 0 ? 1n : -1n
            terms.push({ ccy, scaled: sign * BigInt(px.scaled), scale: px.scale })
          } else {
            terms.push({
              ccy,
              scaled: BigInt(amt.scaled) * BigInt(px.scaled),
              scale: amt.scale + px.scale,
            })
          }
        } else {
          terms.push({ ccy, scaled: BigInt(amt.scaled), scale: amt.scale })
        }
      }
    } catch (e) {
      errs.push(e instanceof Error ? e.message : String(e))
      return errs
    }
    if (inferred > 1) {
      errs.push('at most one posting may omit amount/currency (inferred)')
    } else if (inferred === 0) {
      const byCcy = new Map<string, Term[]>()
      for (const t of terms) {
        const arr = byCcy.get(t.ccy) ?? []
        arr.push(t)
        byCcy.set(t.ccy, arr)
      }
      for (const [ccy, ts] of byCcy) {
        const maxScale = ts.reduce((m, t) => (t.scale > m ? t.scale : m), 0)
        let sum = 0n
        for (const t of ts) {
          sum += t.scaled * 10n ** BigInt(maxScale - t.scale)
        }
        if (sum !== 0n) {
          errs.push(`postings do not balance for ${ccy}: sum=${formatScaled(sum, maxScale)}`)
        }
      }
    }
  }
  return errs
}

function formatScaled(n: bigint, scale: number): string {
  if (scale === 0) return n.toString()
  const neg = n < 0n
  const abs = neg ? -n : n
  const s = abs.toString().padStart(scale + 1, '0')
  const whole = s.slice(0, s.length - scale)
  const frac = s.slice(s.length - scale)
  return `${neg ? '-' : ''}${whole}.${frac}`
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

function valueMapToMeta(
  m: Record<string, Value> | undefined,
): Record<string, string> | null {
  if (!m) return null
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(m)) {
    out[k] = String((v as { value: unknown }).value)
  }
  return Object.keys(out).length > 0 ? out : null
}

function astToInput(txn: BcTransaction): TransactionInput {
  const flag = txn.flag === '*' || txn.flag === '!' ? txn.flag : null
  return {
    date: txn.date.toString(),
    flag,
    payee: txn.payee || undefined,
    narration: txn.narration ?? undefined,
    postings: txn.postings.map((p) => ({
      flag: p.flag ?? null,
      account: p.account,
      amount: p.amount ?? null,
      currency: p.currency ?? null,
      cost_raw: p.cost ?? null,
      price_at_signs: (p.atSigns === 1 || p.atSigns === 2 ? p.atSigns : 0) as 0 | 1 | 2,
      price_amount: p.priceAmount ?? null,
      price_currency: p.priceCurrency ?? null,
      comment: p.comment ?? null,
      meta: valueMapToMeta(p.metadata),
    })),
    tags: txn.tags.map((t) => t.content),
    links: Array.from(txn.links),
    meta: valueMapToMeta(txn.metadata),
  }
}

export function parseText(
  raw: string,
): { ok: true; input: TransactionInput } | { ok: false; errors: string[] } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, errors: ['empty input'] }
  try {
    const result = parse(trimmed)
    if (result.transactions.length === 0) {
      return { ok: false, errors: ['no transaction directive found'] }
    }
    if (result.transactions.length > 1) {
      return { ok: false, errors: ['expected exactly one transaction'] }
    }
    return { ok: true, input: astToInput(result.transactions[0]) }
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)] }
  }
}


import {
  ParseResult,
  Posting as BcPosting,
  Tag as BcTag,
  Transaction as BcTransaction,
  Value,
} from 'beancount'
import type { PostingInput, TransactionInput } from '@/durable/ledger-types'

export function dateFromInt(n: number): string {
  const s = String(n).padStart(8, '0')
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

export function serializeTransactionInput(input: TransactionInput): string {
  const txn = new BcTransaction({
    date: input.date,
    payee: input.payee ?? '',
    narration: input.narration ?? undefined,
    flag: input.flag ?? undefined,
    postings: input.postings.map(postingFromInput),
    postingComments: [],
    tags: (input.tags ?? []).map((t) => new BcTag({ content: t, fromStack: false })),
    links: new Set(input.links ?? []),
    metadata: metaToValueMap(input.meta ?? null),
  })
  const result = new ParseResult([txn])
  const col = result.calculateCurrencyColumn({ minPadding: 2 })
  return result.toFormattedString({ currencyColumn: col }).trim() + '\n'
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

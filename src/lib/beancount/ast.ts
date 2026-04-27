import {
  parse,
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

export function dateToInt(s: string): number {
  const [y, m, d] = s.split('-')
  return Number(`${y}${m}${d}`)
}

export function serializeTransactionInput(input: TransactionInput): string {
  const txn = transactionFromInput(input)
  const result = new ParseResult([txn])
  const col = result.calculateCurrencyColumn({ minPadding: 2 })
  return result.toFormattedString({ currencyColumn: col }).trim() + '\n'
}

export function serializeJournal(inputs: TransactionInput[]): string {
  if (inputs.length === 0) return ''
  const txns = inputs.map(transactionFromInput)
  const result = new ParseResult(txns)
  const col = result.calculateCurrencyColumn({ minPadding: 2 })
  return result.toFormattedString({ currencyColumn: col }).trim() + '\n'
}

export type ParsedJournal = {
  transactions: TransactionInput[]
  unsupportedDirectiveCount: number
  unsupportedDirectiveTypes: string[]
}

const FORMATTING_NODE_TYPES = new Set(['comment', 'blankline'])

export function parseJournal(text: string): ParsedJournal {
  const result = parse(text)
  const transactions = result.transactions.map(transactionToInput)
  const unsupportedTypes = new Set<string>()
  for (const node of result.nodes) {
    if (node.type === 'transaction') continue
    if (FORMATTING_NODE_TYPES.has(node.type)) continue
    unsupportedTypes.add(node.type)
  }
  return {
    transactions,
    unsupportedDirectiveCount: unsupportedTypes.size,
    unsupportedDirectiveTypes: [...unsupportedTypes],
  }
}

export async function transactionInputHash(input: TransactionInput): Promise<string> {
  const text = serializeTransactionInput(input)
  const buf = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  const bytes = new Uint8Array(digest).slice(0, 8)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function transactionFromInput(input: TransactionInput): BcTransaction {
  return new BcTransaction({
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
}

function transactionToInput(txn: BcTransaction): TransactionInput {
  const flag = txn.flag === '*' || txn.flag === '!' ? txn.flag : null
  return {
    date: txn.date.toString(),
    flag,
    payee: txn.payee || undefined,
    narration: txn.narration || undefined,
    postings: txn.postings.map(postingToInput),
    tags: txn.tags.map((t) => t.content),
    links: [...txn.links],
    meta: valueMapToMeta(txn.metadata),
  }
}

function postingToInput(p: BcPosting): PostingInput {
  const at = p.atSigns === 1 || p.atSigns === 2 ? p.atSigns : 0
  return {
    flag: p.flag ?? null,
    account: p.account,
    amount: p.amount ?? null,
    currency: p.currency ?? null,
    cost_raw: p.cost ?? null,
    price_at_signs: at,
    price_amount: p.priceAmount ?? null,
    price_currency: p.priceCurrency ?? null,
    comment: p.comment ?? null,
    meta: valueMapToMeta(p.metadata),
  }
}

function valueMapToMeta(
  map: Record<string, Value> | undefined,
): Record<string, string> | null {
  if (!map) return null
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(map)) {
    if (v.type === 'string') out[k] = String(v.value)
  }
  return Object.keys(out).length > 0 ? out : null
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

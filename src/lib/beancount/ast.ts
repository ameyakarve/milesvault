import {
  parse,
  ParseResult,
  Posting as BcPosting,
  Tag as BcTag,
  Transaction as BcTransaction,
  Open as BcOpen,
  Close as BcClose,
  Commodity as BcCommodity,
  Balance as BcBalance,
  Pad as BcPad,
  Price as BcPrice,
  Note as BcNote,
  Document as BcDocument,
  Event as BcEvent,
  Node as BcNode,
  Value,
} from 'beancount'
import type {
  BalanceInput,
  CloseInput,
  CommodityInput,
  DirectiveInput,
  DocumentInput,
  EventInput,
  NoteInput,
  OpenInput,
  PadInput,
  PostingInput,
  PriceInput,
  TransactionInput,
} from '@/durable/ledger-types'

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

export function serializeJournal(
  transactions: TransactionInput[],
  directives: DirectiveInput[] = [],
  options: { descending?: boolean } = {},
): string {
  if (transactions.length === 0 && directives.length === 0) return ''
  const nodes: BcNode[] = [
    ...transactions.map(transactionFromInput),
    ...directives.map(directiveFromInput),
  ]
  const cmp = options.descending
    ? (a: BcNode, b: BcNode) => -compareDatedNodes(a, b)
    : compareDatedNodes
  nodes.sort(cmp)
  const result = new ParseResult(nodes)
  const col = result.calculateCurrencyColumn({ minPadding: 2 })
  return result.toFormattedString({ currencyColumn: col }).trim() + '\n'
}

export type DirectiveRange = { startLine: number; endLine: number }

export type ParsedEntry =
  | { kind: 'transaction'; index: number; range: DirectiveRange }
  | { kind: 'directive'; index: number; range: DirectiveRange }

export type ParsedJournal = {
  transactions: TransactionInput[]
  directives: DirectiveInput[]
  entries: ParsedEntry[]
  unsupportedDirectiveTypes: string[]
  partialParse: boolean
  expectedDirectiveLineCount: number
  parsedDirectiveCount: number
  droppedLineNumbers: number[]
}

const FORMATTING_NODE_TYPES = new Set(['comment', 'blankline'])
const DATE_LINE_RE = /^\s*\d{4}-\d{2}-\d{2}/
const STRICT_DATE_LINE_RE = /^\d{4}-\d{2}-\d{2}/

function findDateLineNumbers(text: string): number[] {
  const out: number[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (DATE_LINE_RE.test(lines[i]!)) out.push(i + 1)
  }
  return out
}

function findDirectiveRanges(text: string): DirectiveRange[] {
  const lines = text.split('\n')
  const ranges: DirectiveRange[] = []
  let start = -1
  let end = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const isBlank = line.trim().length === 0
    const isStrictDate = STRICT_DATE_LINE_RE.test(line)
    if (isStrictDate) {
      if (start >= 0) ranges.push({ startLine: start + 1, endLine: end + 1 })
      start = i
      end = i
    } else if (isBlank) {
      if (start >= 0) {
        ranges.push({ startLine: start + 1, endLine: end + 1 })
        start = -1
        end = -1
      }
    } else if (start >= 0) {
      end = i
    }
  }
  if (start >= 0) ranges.push({ startLine: start + 1, endLine: end + 1 })
  return ranges
}

export function parseJournal(text: string): ParsedJournal {
  const result = parse(text)
  const transactions: TransactionInput[] = []
  const directives: DirectiveInput[] = []
  const entries: ParsedEntry[] = []
  const unsupportedTypes = new Set<string>()
  let parsedDirectiveCount = 0
  const ranges = findDirectiveRanges(text)
  for (const node of result.nodes) {
    if (FORMATTING_NODE_TYPES.has(node.type)) continue
    const range = ranges[parsedDirectiveCount]
    parsedDirectiveCount++
    if (node.type === 'transaction') {
      const idx = transactions.length
      transactions.push(transactionToInput(node as BcTransaction))
      if (range) entries.push({ kind: 'transaction', index: idx, range })
      continue
    }
    const dir = nodeToDirective(node)
    if (dir) {
      const idx = directives.length
      directives.push(dir)
      if (range) entries.push({ kind: 'directive', index: idx, range })
    } else {
      unsupportedTypes.add(node.type)
    }
  }
  const dateLineNumbers = findDateLineNumbers(text)
  const expected = dateLineNumbers.length
  const partialParse = expected > parsedDirectiveCount
  const droppedLineNumbers = partialParse
    ? dateLineNumbers.slice(parsedDirectiveCount)
    : []
  return {
    transactions,
    directives,
    entries,
    unsupportedDirectiveTypes: [...unsupportedTypes],
    partialParse,
    expectedDirectiveLineCount: expected,
    parsedDirectiveCount,
    droppedLineNumbers,
  }
}

export async function transactionInputHash(input: TransactionInput): Promise<string> {
  return canonicalHash(transactionFromInput(input))
}

export async function directiveInputHash(input: DirectiveInput): Promise<string> {
  return canonicalHash(directiveFromInput(input))
}

async function canonicalHash(node: BcNode): Promise<string> {
  const result = new ParseResult([node])
  const col = result.calculateCurrencyColumn({ minPadding: 2 })
  const text = result.toFormattedString({ currencyColumn: col }).trim()
  const buf = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  const bytes = new Uint8Array(digest).slice(0, 8)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function compareDatedNodes(a: BcNode, b: BcNode): number {
  const da = (a as { date?: { toString(): string } }).date?.toString() ?? ''
  const db = (b as { date?: { toString(): string } }).date?.toString() ?? ''
  if (da !== db) return da.localeCompare(db)
  // Within a day: balance assertions sort last (descending display puts them on top).
  const aw = a.type === 'balance' ? 1 : 0
  const bw = b.type === 'balance' ? 1 : 0
  if (aw !== bw) return aw - bw
  return a.type.localeCompare(b.type)
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
  for (const k of Object.keys(meta).sort()) {
    out[k] = new Value({ type: 'string', value: meta[k]! })
  }
  return out
}

function directiveFromInput(d: DirectiveInput): BcNode {
  switch (d.kind) {
    case 'open':
      return new BcOpen({
        date: d.date,
        account: d.account,
        constraintCurrencies: d.constraint_currencies?.length
          ? [...d.constraint_currencies]
          : undefined,
        bookingMethod: d.booking_method ?? undefined,
        metadata: metaToValueMap(d.meta ?? null),
      })
    case 'close':
      return new BcClose({
        date: d.date,
        account: d.account,
        metadata: metaToValueMap(d.meta ?? null),
      })
    case 'commodity':
      return new BcCommodity({
        date: d.date,
        currency: d.currency,
        metadata: metaToValueMap(d.meta ?? null),
      })
    case 'balance':
      return new BcBalance({
        date: d.date,
        account: d.account,
        amount: d.amount,
        currency: d.currency,
        metadata: metaToValueMap(d.meta ?? null),
      })
    case 'pad':
      return new BcPad({
        date: d.date,
        account: d.account,
        accountPad: d.account_pad,
        metadata: metaToValueMap(d.meta ?? null),
      })
    case 'price':
      return new BcPrice({
        date: d.date,
        commodity: d.commodity,
        currency: d.currency,
        amount: d.amount,
        metadata: metaToValueMap(d.meta ?? null),
      })
    case 'note':
      return new BcNote({
        date: d.date,
        account: d.account,
        description: d.description,
        metadata: metaToValueMap(d.meta ?? null),
      })
    case 'document':
      return new BcDocument({
        date: d.date,
        account: d.account,
        pathToDocument: d.filename,
        metadata: metaToValueMap(d.meta ?? null),
      })
    case 'event':
      return new BcEvent({
        date: d.date,
        name: d.name,
        value: new Value({ type: 'string', value: d.value }),
        metadata: metaToValueMap(d.meta ?? null),
      })
  }
}

function nodeToDirective(node: BcNode): DirectiveInput | null {
  switch (node.type) {
    case 'open': {
      const n = node as BcOpen
      const out: OpenInput & { kind: 'open' } = {
        kind: 'open',
        date: n.date.toString(),
        account: n.account,
        meta: valueMapToMeta(n.metadata),
      }
      if (n.bookingMethod) out.booking_method = n.bookingMethod
      if (n.constraintCurrencies && n.constraintCurrencies.length > 0) {
        out.constraint_currencies = [...n.constraintCurrencies]
      }
      return out
    }
    case 'close': {
      const n = node as BcClose
      const out: CloseInput & { kind: 'close' } = {
        kind: 'close',
        date: n.date.toString(),
        account: n.account,
        meta: valueMapToMeta(n.metadata),
      }
      return out
    }
    case 'commodity': {
      const n = node as BcCommodity
      const out: CommodityInput & { kind: 'commodity' } = {
        kind: 'commodity',
        date: n.date.toString(),
        currency: n.currency,
        meta: valueMapToMeta(n.metadata),
      }
      return out
    }
    case 'balance': {
      const n = node as BcBalance
      const out: BalanceInput & { kind: 'balance' } = {
        kind: 'balance',
        date: n.date.toString(),
        account: n.account,
        amount: n.amount,
        currency: n.currency,
        meta: valueMapToMeta(n.metadata),
      }
      return out
    }
    case 'pad': {
      const n = node as BcPad
      const out: PadInput & { kind: 'pad' } = {
        kind: 'pad',
        date: n.date.toString(),
        account: n.account,
        account_pad: n.accountPad,
        meta: valueMapToMeta(n.metadata),
      }
      return out
    }
    case 'price': {
      const n = node as BcPrice
      const out: PriceInput & { kind: 'price' } = {
        kind: 'price',
        date: n.date.toString(),
        commodity: n.commodity,
        currency: n.currency,
        amount: n.amount,
        meta: valueMapToMeta(n.metadata),
      }
      return out
    }
    case 'note': {
      const n = node as BcNote
      const out: NoteInput & { kind: 'note' } = {
        kind: 'note',
        date: n.date.toString(),
        account: n.account,
        description: n.description,
        meta: valueMapToMeta(n.metadata),
      }
      return out
    }
    case 'document': {
      const n = node as BcDocument
      const out: DocumentInput & { kind: 'document' } = {
        kind: 'document',
        date: n.date.toString(),
        account: n.account,
        filename: n.pathToDocument,
        meta: valueMapToMeta(n.metadata),
      }
      return out
    }
    case 'event': {
      const n = node as BcEvent
      const v = n.value
      const out: EventInput & { kind: 'event' } = {
        kind: 'event',
        date: n.date.toString(),
        name: n.name,
        value: v.type === 'string' ? String(v.value) : '',
        meta: valueMapToMeta(n.metadata),
      }
      return out
    }
    default:
      return null
  }
}

import {
  Balance as BcBalance,
  Close as BcClose,
  Commodity as BcCommodity,
  Document as BcDocument,
  Event as BcEvent,
  Note as BcNote,
  Open as BcOpen,
  Pad as BcPad,
  ParseResult,
  Posting as BcPosting,
  Price as BcPrice,
  Tag as BcTag,
  Transaction as BcTransaction,
  Value,
  parse,
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
} from '@/durable/ledger-v2-types'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DECIMAL_RE = /^-?\d+(\.\d+)?$/

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
  if (!Array.isArray(input.postings) || input.postings.length < 2) {
    errs.push('at least 2 postings are required')
    return errs
  }

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

function buildOpenAst(input: OpenInput): BcOpen {
  return new BcOpen({
    date: input.date,
    account: input.account,
    bookingMethod: input.booking_method ?? undefined,
    constraintCurrencies:
      input.constraint_currencies && input.constraint_currencies.length > 0
        ? input.constraint_currencies
        : undefined,
    metadata: metaToValueMap(input.meta ?? null),
  })
}

function buildCloseAst(input: CloseInput): BcClose {
  return new BcClose({
    date: input.date,
    account: input.account,
    metadata: metaToValueMap(input.meta ?? null),
  })
}

function buildCommodityAst(input: CommodityInput): BcCommodity {
  return new BcCommodity({
    date: input.date,
    currency: input.currency,
    metadata: metaToValueMap(input.meta ?? null),
  })
}

function buildBalanceAst(input: BalanceInput): BcBalance {
  return new BcBalance({
    date: input.date,
    account: input.account,
    amount: input.amount,
    currency: input.currency,
    metadata: metaToValueMap(input.meta ?? null),
  })
}

function buildPadAst(input: PadInput): BcPad {
  return new BcPad({
    date: input.date,
    account: input.account,
    accountPad: input.account_pad,
    metadata: metaToValueMap(input.meta ?? null),
  })
}

function buildPriceAst(input: PriceInput): BcPrice {
  return new BcPrice({
    date: input.date,
    commodity: input.commodity,
    currency: input.currency,
    amount: input.amount,
    metadata: metaToValueMap(input.meta ?? null),
  })
}

function buildNoteAst(input: NoteInput): BcNote {
  return new BcNote({
    date: input.date,
    account: input.account,
    description: input.description,
    metadata: metaToValueMap(input.meta ?? null),
  })
}

function buildDocumentAst(input: DocumentInput): BcDocument {
  return new BcDocument({
    date: input.date,
    account: input.account,
    pathToDocument: input.filename,
    metadata: metaToValueMap(input.meta ?? null),
  })
}

function buildEventAst(input: EventInput): BcEvent {
  return new BcEvent({
    date: input.date,
    name: input.name,
    value: new Value({ type: 'string', value: input.value }),
    metadata: metaToValueMap(input.meta ?? null),
  })
}

export function serializeDirective(d: DirectiveInput): string {
  switch (d.kind) {
    case 'transaction':
      return serializeTransaction(buildTransactionAst(d.input))
    case 'open':
    case 'close':
    case 'commodity':
    case 'balance':
    case 'pad':
    case 'price':
    case 'note':
    case 'document':
    case 'event': {
      const node =
        d.kind === 'open'
          ? buildOpenAst(d.input)
          : d.kind === 'close'
            ? buildCloseAst(d.input)
            : d.kind === 'commodity'
              ? buildCommodityAst(d.input)
              : d.kind === 'balance'
                ? buildBalanceAst(d.input)
                : d.kind === 'pad'
                  ? buildPadAst(d.input)
                  : d.kind === 'price'
                    ? buildPriceAst(d.input)
                    : d.kind === 'note'
                      ? buildNoteAst(d.input)
                      : d.kind === 'document'
                        ? buildDocumentAst(d.input)
                        : buildEventAst(d.input)
      const result = new ParseResult([node])
      return result.toFormattedString().trim() + '\n'
    }
  }
}

function openToInput(n: BcOpen): OpenInput {
  return {
    date: n.date.toString(),
    account: n.account,
    booking_method: n.bookingMethod ?? null,
    constraint_currencies: n.constraintCurrencies ?? [],
    meta: valueMapToMeta(n.metadata),
  }
}
function closeToInput(n: BcClose): CloseInput {
  return {
    date: n.date.toString(),
    account: n.account,
    meta: valueMapToMeta(n.metadata),
  }
}
function commodityToInput(n: BcCommodity): CommodityInput {
  return {
    date: n.date.toString(),
    currency: n.currency,
    meta: valueMapToMeta(n.metadata),
  }
}
function balanceToInput(n: BcBalance): BalanceInput {
  return {
    date: n.date.toString(),
    account: n.account,
    amount: n.amount,
    currency: n.currency,
    meta: valueMapToMeta(n.metadata),
  }
}
function padToInput(n: BcPad): PadInput {
  return {
    date: n.date.toString(),
    account: n.account,
    account_pad: n.accountPad,
    meta: valueMapToMeta(n.metadata),
  }
}
function priceToInput(n: BcPrice): PriceInput {
  return {
    date: n.date.toString(),
    commodity: n.commodity,
    currency: n.currency,
    amount: n.amount,
    meta: valueMapToMeta(n.metadata),
  }
}
function noteToInput(n: BcNote): NoteInput {
  return {
    date: n.date.toString(),
    account: n.account,
    description: n.description,
    meta: valueMapToMeta(n.metadata),
  }
}
function documentToInput(n: BcDocument): DocumentInput {
  return {
    date: n.date.toString(),
    account: n.account,
    filename: n.pathToDocument,
    meta: valueMapToMeta(n.metadata),
  }
}
function eventToInput(n: BcEvent): EventInput {
  return {
    date: n.date.toString(),
    name: n.name,
    value: String((n.value as { value: unknown }).value),
    meta: valueMapToMeta(n.metadata),
  }
}

export function parseText(
  raw: string,
): { ok: true; directives: DirectiveInput[] } | { ok: false; errors: string[] } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, errors: ['empty input'] }
  let result: ParseResult
  try {
    result = parse(trimmed)
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)] }
  }
  const errs: string[] = []
  if (result.option.length > 0) errs.push("'option' directive is not supported")
  if (result.plugin.length > 0) errs.push("'plugin' directive is not supported")
  if (result.include.length > 0) errs.push("'include' directive is not supported")
  if (result.pushtag.length > 0) errs.push("'pushtag' directive is not supported")
  if (result.poptag.length > 0) errs.push("'poptag' directive is not supported")
  if (result.query.length > 0) errs.push("'query' directive is not supported")
  if (result.custom.length > 0) errs.push("'custom' directive is not supported")
  if (errs.length > 0) return { ok: false, errors: errs }

  const directives: DirectiveInput[] = []
  for (const t of result.transactions) directives.push({ kind: 'transaction', input: astToInput(t) })
  for (const n of result.open) directives.push({ kind: 'open', input: openToInput(n) })
  for (const n of result.close) directives.push({ kind: 'close', input: closeToInput(n) })
  for (const n of result.commodity) directives.push({ kind: 'commodity', input: commodityToInput(n) })
  for (const n of result.balance) directives.push({ kind: 'balance', input: balanceToInput(n) })
  for (const n of result.pad) directives.push({ kind: 'pad', input: padToInput(n) })
  for (const n of result.price) directives.push({ kind: 'price', input: priceToInput(n) })
  for (const n of result.note) directives.push({ kind: 'note', input: noteToInput(n) })
  for (const n of result.document) directives.push({ kind: 'document', input: documentToInput(n) })
  for (const n of result.event) directives.push({ kind: 'event', input: eventToInput(n) })

  if (directives.length === 0) {
    return { ok: false, errors: ['no supported directive found'] }
  }
  return { ok: true, directives }
}

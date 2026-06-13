import { z } from 'zod'
import type { TransactionInput, DirectiveInput } from '../ledger-types'
import { serializeTransactionInput, serializeJournal } from '@/lib/beancount/ast'

// The shared draft IR — ONE definition of "an entry", used by BOTH the headless
// statement-ingest pipeline (JSON output) AND the editor's `draft_transaction`
// tool. The model emits structured entries (transactions as top line + typed
// postings, stated balances as balance directives whose `plug_account` subsumes
// the pad); LOOSE zod schemas `.transform()` them into the canonical zod-first
// types in src/durable/ledger-types.ts, and the SAME serializer (beancount AST)
// renders them to text. Pure data + serialization — no DO / env / network deps,
// so it is safe to import on the client (the draft card serializes IR → text
// for inline editing).
//
// Code is NOT an arbiter (owner ruling): it does not compute card legs, points
// or signs, and does not rewrite accounts. The model authors every posting; code
// only parses the IR, serializes it, and runs the generic balance/shape
// validator whose findings bounce back to the model.

// ---- Amount parsing helpers ----------------------------------------------------

export function num(v: string | number | null | undefined): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

export function fmt(n: number): string {
  return n.toFixed(2)
}

// ---- Loose acceptors → canonical types -----------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const ZAmount = z.union([z.string(), z.number()])

// Accepts what a model plausibly emits; outputs a canonical PostingInput.
// (`amount` is optional in the schema, but the generic balance validator still
// requires every currency to net to zero, so provide explicit amounts.)
export const ZLoosePosting = z
  .object({
    account: z.string().min(3),
    amount: ZAmount.nullable().optional(),
    currency: z.string().max(24).nullable().optional(),
    price_at_signs: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
    price_amount: ZAmount.nullable().optional(),
    price_currency: z.string().max(24).nullable().optional(),
  })
  .transform((p) => {
    const amount = num(p.amount)
    const priceAmount = num(p.price_amount)
    return {
      account: p.account,
      amount: amount === null ? null : fmt(amount),
      currency: p.currency ?? (amount === null ? null : 'INR'),
      ...(p.price_at_signs && priceAmount !== null
        ? {
            price_at_signs: p.price_at_signs,
            price_amount: fmt(priceAmount),
            price_currency: p.price_currency ?? 'INR',
          }
        : {}),
    }
  })

// Every entry carries a model-assigned stable `id` so corrections can be
// SURGICAL: a bad entry is re-requested by id and merged back, instead of
// regenerating the whole batch (which shifts indices and re-rolls good entries).
export const ZLooseTxn = z
  .object({
    id: z.string().min(1).max(24),
    kind: z.literal('transaction'),
    date: z.string().regex(DATE_RE),
    flag: z.enum(['*', '!']).optional(),
    payee: z.string().max(120).optional(),
    narration: z.string().max(200).optional(),
    tags: z.array(z.string().max(40)).optional(),
    postings: z.array(ZLoosePosting).min(2).max(8),
  })
  .transform(
    (t): { id: string; kind: 'transaction'; txn: TransactionInput } => ({
      id: t.id,
      kind: 'transaction',
      txn: {
        date: t.date,
        flag: t.flag ?? '*',
        payee: t.payee ?? '',
        narration: t.narration ?? '',
        tags: (t.tags ?? []).map((x) => x.replace(/^#/, '')),
        postings: t.postings,
      },
    }),
  )

// Two closing-assertion kinds, mapping to the two beancount concepts:
//   `pad`     → a pad + balance pair; the pad absorbs drift up to the asserted
//               figure (the printed total is the truth).
//   `balance` → a bare balance assertion (no pad); the running balance must
//               already equal the figure exactly or the write is rejected.
const ZBalanceBase = {
  id: z.string().min(1).max(24),
  date: z.string().regex(DATE_RE),
  account: z.string().min(3),
  amount: ZAmount,
  currency: z.string().max(24),
}
export const ZLooseBalance = z
  .object({ kind: z.literal('balance'), ...ZBalanceBase })
  .transform((b) => ({
    id: b.id,
    kind: 'balance' as const,
    date: b.date,
    account: b.account,
    amount: String(b.amount),
    currency: b.currency,
    plug_account: undefined as string | undefined, // bare assertion — no pad
  }))
export const ZLoosePad = z
  .object({ kind: z.literal('pad'), ...ZBalanceBase })
  .transform((b) => ({
    id: b.id,
    kind: 'pad' as const,
    date: b.date,
    account: b.account,
    amount: String(b.amount),
    currency: b.currency,
    // One plug for ALL pads — Equity:Void, every account type (owner ruling).
    plug_account: 'Equity:Void' as string | undefined,
  }))

export const ZEntry = z.discriminatedUnion('kind', [ZLooseTxn, ZLooseBalance, ZLoosePad])
export type ExtractedEntry = z.infer<typeof ZEntry>

// ---- IR → beancount text (no arbiter): code only splits + serializes -----------

// Render ONE entry to canonical beancount (same formatter as journal saves).
export function serializeIrEntry(e: ExtractedEntry): string {
  if (e.kind === 'balance' || e.kind === 'pad') {
    return serializeJournal(
      [],
      [
        {
          kind: 'balance',
          date: e.date,
          account: e.account,
          amount: e.amount,
          currency: e.currency,
          plug_account: e.plug_account, // set for `pad`, undefined for bare `balance`
        },
      ],
    ).trim()
  }
  return serializeTransactionInput(e.txn).trim()
}

// Accept either RAW entries (as the model emits them) or already-transformed
// ExtractedEntry (as a server parse produces). The tool-call input that reaches
// the client may be in either form depending on where it was parsed, so coerce
// before serializing rather than assuming one shape.
function coerce(e: unknown): ExtractedEntry {
  const r = ZEntry.safeParse(e)
  return r.success ? r.data : (e as ExtractedEntry)
}

// Order-preserving: one string per entry, in the order the model emitted them.
export function serializeIrEntries(entries: readonly unknown[]): string[] {
  return entries.map((e) => serializeIrEntry(coerce(e)))
}

// Split an entry list for the canonical journal serializer (transactions first,
// then directives). Used by the pipeline's capture path.
export function toLedgerEntries(entries: ExtractedEntry[]): {
  transactions: TransactionInput[]
  directives: DirectiveInput[]
} {
  const transactions: TransactionInput[] = []
  const directives: DirectiveInput[] = []
  for (const e of entries) {
    if (e.kind === 'balance' || e.kind === 'pad') {
      directives.push({
        kind: 'balance',
        date: e.date,
        account: e.account,
        amount: e.amount,
        currency: e.currency,
        plug_account: e.plug_account,
      })
    } else {
      transactions.push(e.txn)
    }
  }
  return { transactions, directives }
}

export function serializeEntries(parts: {
  transactions: TransactionInput[]
  directives: DirectiveInput[]
}): string[] {
  const out: string[] = []
  for (const t of parts.transactions) out.push(serializeTransactionInput(t).trim())
  for (const d of parts.directives) out.push(serializeJournal([], [d]).trim())
  return out
}

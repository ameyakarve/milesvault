import { z } from 'zod'
import { fetchCardGuide, type CardGuideResult } from '../agents/tools/editor/card-guide'
import type { KbHttp } from '../agents/tools/concierge/kb-tools'
import type { TransactionInput, DirectiveInput } from '../ledger-types'
import { serializeTransactionInput, serializeJournal } from '@/lib/beancount/ast'
import { validateDraftBatch } from '@/lib/beancount/validate-draft-batch'

// Statement-ingest pipeline.
//
//   The MODEL emits complete beancount; code validates and serializes.
//
// The IR is beancount itself (owner decision): the model emits an array of
// entry objects — transactions as top line + postings, stated balances as
// balance directives whose `plug_account` subsumes the pad — accepted by
// LOOSE zod schemas that `.transform()` into the canonical zod-first types
// in src/durable/ledger-types.ts. One definition of what an entry is; no
// drifting mirrors. Forex prices, multi-leg fees and tags stay expressible.
//
// Code is NOT an arbiter (owner ruling): it does not compute card legs, points
// or signs, and does not rewrite accounts. The model authors every posting,
// guided by the shared prompt (which carries the card's rate, pool and the
// existing accounts). Code only: parses the JSON into the IR, splits it for
// the canonical serializer, and runs the GENERIC validator (parse +
// per-currency balance + account shape) — whose findings bounce verbatim back
// to the model. Same conventions as the editor; the only delta is the output
// channel (JSON IR here vs the draft_transaction tool there).

// ---- Amount parsing helpers ----------------------------------------------------

function num(v: string | number | null | undefined): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function fmt(n: number): string {
  return n.toFixed(2)
}

// ---- Loose acceptors → canonical types -----------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ZAmount = z.union([z.string(), z.number()])

// Accepts what a model plausibly emits; outputs a canonical PostingInput.
const ZLoosePosting = z
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

const ZLooseTxn = z
  .object({
    kind: z.literal('transaction'),
    date: z.string().regex(DATE_RE),
    flag: z.enum(['*', '!']).optional(),
    payee: z.string().max(120).optional(),
    narration: z.string().max(200).optional(),
    tags: z.array(z.string().max(40)).optional(),
    postings: z.array(ZLoosePosting).min(2).max(8),
  })
  .transform(
    (t): { kind: 'transaction'; txn: TransactionInput } => ({
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

// Balance directive — `plug_account` IS the pad (canonical schema's design).
// currency "POINTS" is the reward-points sentinel, resolved downstream.
const ZLooseBalance = z
  .object({
    kind: z.literal('balance'),
    date: z.string().regex(DATE_RE),
    account: z.string().min(3),
    amount: ZAmount,
    currency: z.string().max(24),
    plug_account: z.string().optional(),
  })
  .transform((b) => ({
    kind: 'balance' as const,
    date: b.date,
    account: b.account,
    amount: String(b.amount),
    currency: b.currency,
    // One plug for all statement pads (owner ruling: don't complicate).
    plug_account: 'Equity:Adjustments',
  }))

const ZStatement = z.object({
  card_name: z.string().min(2).max(80),
  entries: z.array(z.discriminatedUnion('kind', [ZLooseTxn, ZLooseBalance])).min(1).max(250),
})
export type ExtractedStatement = z.infer<typeof ZStatement>

// ---- JSON-only model call ------------------------------------------------------

export type GenFn = (opts: {
  system: string
  prompt: string
  maxTokens: number
  images?: string[]
}) => Promise<string>

function firstJsonBlock(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inStr = false
  let escNext = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (escNext) {
      escNext = false
      continue
    }
    if (c === '\\') {
      escNext = inStr
      continue
    }
    if (c === '"') inStr = !inStr
    if (inStr) continue
    if (c === '{') depth++
    if (c === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

async function genJson<T>(
  gen: GenFn,
  schema: z.ZodType<T>,
  system: string,
  prompt: string,
  maxTokens: number,
  images?: string[],
  attempts = 3,
): Promise<{ value: T | null; error: string | null }> {
  let lastError = ''
  let p = prompt
  for (let i = 0; i < attempts; i++) {
    const text = await gen({ system, prompt: p, maxTokens, images })
    const block = firstJsonBlock(text)
    if (!block) {
      lastError = 'no JSON object in output'
    } else {
      try {
        const parsed = schema.safeParse(JSON.parse(block))
        if (parsed.success) return { value: parsed.data, error: null }
        lastError = parsed.error.issues
          .map((iss) => `${iss.path.join('.')}: ${iss.message}`)
          .join('; ')
      } catch (e) {
        lastError = `invalid JSON: ${String(e)}`
      }
    }
    p = `${prompt}\n\nYour previous output was invalid (${lastError}). Output ONLY the corrected JSON object.`
  }
  return { value: null, error: lastError }
}

// ---- Rate parsing (code, not model) --------------------------------------------

// "Base 12 EDGE RPs / ₹200", "Base earn: 5 RP / ₹150", "1 MR / ₹50" …
export function parseBaseRate(guide: CardGuideResult): { pts: number; per: number } | null {
  if (!guide.ok) return null
  const sources = [guide.logging_guide, guide.pool?.rate_notes, guide.card_notes]
  for (const src of sources) {
    if (!src) continue
    const m = /(\d+)\s*(?:[A-Za-z ]{0,16}?)\s*\/\s*₹\s*([\d,]+)/.exec(src)
    if (m) {
      const pts = Number(m[1])
      const per = Number(m[2].replace(/,/g, ''))
      if (pts > 0 && per > 0) return { pts, per }
    }
  }
  return null
}

// ---- IR → entries (no arbiter): code only splits + serializes ---------------
//
// Owner ruling: code is NOT an arbiter. The model emits complete beancount
// directives in the IR (balanced card legs, correct signs, canonical accounts,
// points legs, the landing, pad+balance). Here we only split them for the
// serializer; the generic validator (parse + per-currency balance + account
// shape) bounces any repair back to the model. No points math, no card-leg
// fill, no account rewriting, no sentinels.
export function toLedgerEntries(opts: {
  extracted: ExtractedStatement
}): { transactions: TransactionInput[]; directives: DirectiveInput[] } {
  const transactions: TransactionInput[] = []
  const directives: DirectiveInput[] = []
  for (const e of opts.extracted.entries) {
    if (e.kind === 'balance') {
      directives.push({
        kind: 'balance',
        date: e.date,
        account: e.account,
        amount: e.amount,
        currency: e.currency,
        // One plug for all statement pads (owner ruling: don't complicate).
        plug_account: e.plug_account ?? 'Equity:Adjustments',
      })
    } else {
      transactions.push(e.txn)
    }
  }
  return { transactions, directives }
}

// Serialize each entry standalone via the canonical serializer — identical
// formatting to journal saves; the drafts contract is one string per entry.
export function serializeEntries(parts: {
  transactions: TransactionInput[]
  directives: DirectiveInput[]
}): string[] {
  const out: string[] = []
  for (const t of parts.transactions) out.push(serializeTransactionInput(t).trim())
  for (const d of parts.directives) out.push(serializeJournal([], [d]).trim())
  return out
}

// ---- Prompts -------------------------------------------------------------------

const CARD_SYSTEM = `Identify the credit card a statement belongs to. Output ONLY: {"card_name": "issuer + card name as printed"}`
const ZCard = z.object({ card_name: z.string().min(2).max(80) })

function extractPrompt(opts: {
  statementText: string
  accounts: readonly string[]
  cardRules: string | null
  pool: { ticker: string | null; account: string | null } | null
  rate: { pts: number; per: number } | null
  instruction?: string | null
}): string {
  const reward =
    opts.pool?.account && opts.pool?.ticker && opts.rate
      ? `Reward programme for this card (emit the points legs yourself, per the Points pattern):
- points account: ${opts.pool.account}  (earn → ${opts.pool.account}:Pending; posted/landed → ${opts.pool.account})
- points commodity (ticker): ${opts.pool.ticker}
- base earn rate: ${opts.rate.pts} points per ${opts.rate.per} (floor(spend / ${opts.rate.per}) × ${opts.rate.pts}, purchase amount only)`
      : 'Reward programme: none resolved — DO NOT emit points legs.'
  return `${opts.instruction?.trim() ? `User instruction: ${opts.instruction.trim()}\n\n` : ''}Existing ledger accounts:
${opts.accounts.join('\n')}

${reward}

Card earn-exclusion rules:
${opts.cardRules ?? '(none known)'}

--- statement ---
${opts.statementText}`
}

// ---- Orchestration -------------------------------------------------------------

// Gemma-4-26b has a 256k context and no separate output cap, so the only
// limit on extraction output is what we set. A long statement's JSON
// (one entry per row, multi-leg forex included) can run well past 12k
// tokens; capping low truncated it mid-JSON and every retry re-truncated
// — the 'stuck forever' the owner hit. Generous budget; streaming keeps
// the long generation alive.
const EXTRACT_MAX_TOKENS = 32768

// Vision path: the page images are attached; the system prompt
// (buildStatementIrSystem) carries every extraction rule. The user turn
// just points the model at the images.
const VISION_EXTRACT_INSTRUCTION =
  'The attached images are the pages of a credit-card statement, and below is the text already extracted from the PDF. PREFER THE TEXT: it is reliable for anything legible in it (dates, amounts, merchant names) — use it as the source of truth there. Use the IMAGES only to read what the text is missing or garbled (e.g. labels the bank renders as images, like the reward-points summary). Output the single JSON object of entries per the rules above — every transaction and every stated balance, including the reward-points balance.'

export type PipelineResult = {
  ok: boolean
  entries: string[]
  error?: string
  stages: {
    card?: { name?: string; error?: string }
    guide?: { found: boolean; rate?: string; error?: string }
    extract?: { txns: number; balances: number; error?: string }
    validate?: { issues: number }
  }
  // FULL validator messages — never truncated (owner decree): these surface
  // on the Inbox item and in the tool log verbatim.
  validation_issues: string[]
}

export async function runDraftPipeline(deps: {
  gen: GenFn
  kb: KbHttp
  // PDF-extracted text (exact amounts) plus the page images (gemma is
  // multimodal — it reads labels the text can't, e.g. image-rendered
  // points summaries).
  statementText: string
  images?: string[]
  accounts: readonly string[]
  // The shared convention stack (buildStatementIrSystem) — injected so this
  // module stays free of the generated-prompt import cycle.
  system: string
  instruction?: string | null
}): Promise<PipelineResult> {
  const stages: PipelineResult['stages'] = {}

  // 1. Identify the card (tiny call) → guide → rate, so the guide's
  //    exclusion rules ride the extraction prompt.
  const cardRes = await genJson(deps.gen, ZCard, CARD_SYSTEM, deps.statementText.slice(0, 4000), 256)
  stages.card = { name: cardRes.value?.card_name, error: cardRes.error ?? undefined }
  let guide: CardGuideResult = cardRes.value
    ? await fetchCardGuide(deps.kb, cardRes.value.card_name)
    : { ok: false, error: 'card_not_identified' }
  // Ambiguous resolution returns candidates. Code did the RECALL; the
  // MODEL does the choosing (owner design — no matching heuristics here).
  if (guide.ok === false && guide.candidates?.length && cardRes.value) {
    const cands: Array<{ slug: string; name: string | null }> = guide.candidates
    const pick = await genJson(
      deps.gen,
      z.object({ name: z.string().nullable() }),
      'A statement names a credit card; the knowledge graph offers candidate cards. Output ONLY {"name": "<exact candidate name>"} for the matching card, or {"name": null} if none match.',
      `Statement card: ${cardRes.value.card_name}\nCandidates:\n${cands.map((c) => `- ${c.name}`).join('\n')}`,
      128,
    )
    if (pick.value?.name) {
      guide = await fetchCardGuide(deps.kb, pick.value.name)
    }
  }
  const rate = parseBaseRate(guide)
  stages.guide = {
    found: guide.ok,
    rate: rate ? `${rate.pts}/${rate.per}` : undefined,
    error: guide.ok ? undefined : (guide as { error?: string }).error,
  }

  // 2-4. Extract → render → validate, with the validator CLOSING THE LOOP:
  // entries that fail the draft validator go back to the model with the
  // full messages (the agent flow's bounce, in pipeline form — without it,
  // an invalid forex refund once sailed straight into the drafts).
  const basePrompt = extractPrompt({
    statementText: deps.statementText,
    accounts: deps.accounts,
    cardRules: guide.ok ? (guide.logging_guide ?? guide.pool?.rate_notes ?? null) : null,
    pool: guide.ok ? guide.pool : null,
    rate,
    instruction: deps.instruction,
  })
  let entries: string[] = []
  let validation_issues: string[] = []
  let prompt = basePrompt
  let lastExtractError: string | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const ext = await genJson(deps.gen, ZStatement, deps.system, prompt, EXTRACT_MAX_TOKENS, deps.images)
    if (ext.value === null) {
      lastExtractError = ext.error ?? 'unknown'
      stages.extract = { txns: 0, balances: 0, error: lastExtractError }
      continue
    }
    const txns = ext.value.entries.filter((e) => e.kind === 'transaction').length
    stages.extract = { txns, balances: ext.value.entries.length - txns }
    lastExtractError = null

    const parts = toLedgerEntries({ extracted: ext.value })
    entries = serializeEntries(parts)
    // Generic validator only: parse + per-currency balance + account shape.
    // Whatever it flags bounces back to the model verbatim — code never fixes
    // the entries itself.
    const v = validateDraftBatch(entries)
    validation_issues = v.ok === true ? [] : v.issues.map((i) => i.message)
    if (validation_issues.length === 0) break
    prompt = `${basePrompt}\n\nYour previous output produced INVALID entries — fix these and output the corrected full JSON object:\n${validation_issues.join('\n')}`
  }
  if (lastExtractError !== null && entries.length === 0) {
    return { ok: false, entries: [], error: `extract: ${lastExtractError}`, stages, validation_issues: [] }
  }
  if (!guide.ok) {
    validation_issues.unshift(
      `Reward points OMITTED: card guide not found for "${cardRes.value?.card_name ?? '?'}" (${(guide as { error?: string }).error ?? 'unknown'}${guide.ok === false && guide.candidates ? `; candidates: ${guide.candidates.map((c) => c.name).join(', ')}` : ''})`,
    )
  } else if (!rate) {
    validation_issues.unshift(
      `Reward points OMITTED: no base earn rate parsed from the card guide for "${guide.card.name}" — check the KG Logging section.`,
    )
  }
  stages.validate = { issues: validation_issues.length }

  return { ok: entries.length > 0, entries, stages, validation_issues }
}

import { z } from 'zod'
import { fetchCardGuide, type CardGuideResult } from '../agents/tools/editor/card-guide'
import type { KbHttp } from '../agents/tools/concierge/kb-tools'
import type { TransactionInput, DirectiveInput } from '../ledger-types'
import { serializeTransactionInput, serializeJournal } from '@/lib/beancount/ast'
import { validateDraftBatch } from '@/lib/beancount/validate-draft-batch'

// Deterministic statement-ingest pipeline.
//
//   model CLASSIFIES, code COMPUTES.
//
// The IR is beancount itself (owner decision): the model emits an array of
// entry objects — transactions as top line + postings, stated balances as
// balance directives whose `plug_account` subsumes the pad — accepted by
// LOOSE zod schemas that `.transform()` into the canonical zod-first types
// in src/durable/ledger-types.ts. One definition of what an entry is; no
// drifting mirrors. Forex prices, multi-leg fees and tags stay expressible.
//
// Code is the arbiter of everything load-bearing:
//   - the card leg's amount is COMPUTED by code as −(sum of INR weights,
//     @@ prices included) — whatever the model claimed is discarded, so
//     model arithmetic can never unbalance an entry (forex included);
//   - reward-point legs are stripped and recomputed (floor blocks) from
//     the KG rate; refunds claw back with mirrored negative legs;
//   - accounts sanitized; balance directives default plug
//     Equity:Opening-Balances; "POINTS" currency sentinel lands on the
//     pool wallet in its ticker;
//   - rendering via the canonical serializer (same formatting as saves).

// ---- Code arbiters -------------------------------------------------------------

// Beancount account segments start with uppercase or digit (…:3467 is legal).
const SEGMENT_RE = /^[A-Z0-9][A-Za-z0-9-]*$/

export function sanitizeAccount(account: string, fallback: string): string {
  const parts = account
    .split(':')
    .map((p) => p.replace(/[^A-Za-z0-9-]/g, '').replace(/^([a-z])/, (c) => c.toUpperCase()))
  if (parts.length < 2 || !parts.every((p) => SEGMENT_RE.test(p))) return fallback
  return parts.join(':')
}

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

export type GenFn = (system: string, prompt: string, maxTokens: number) => Promise<string>

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
  attempts = 3,
): Promise<{ value: T | null; error: string | null }> {
  let lastError = ''
  let p = prompt
  for (let i = 0; i < attempts; i++) {
    const text = await gen(system, p, maxTokens)
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

// ---- Code as arbiter: canonicalize, points, sentinel resolution ---------------

const EXCLUDED_TAG = 'earn-excluded'

// The card liability account is too important to trust the model with.
// Preference order: the model's account when it already exists in the
// ledger → an existing Liabilities:CreditCards account whose name carries
// the card's tokens → the canonical Liabilities:CreditCards:<Issuer>:<Leaf>
// built from the KG guide → sanitized model output as a last resort.
export function resolveCardAccount(opts: {
  modelAccount: string | null
  accounts: readonly string[]
  issuer: string | null
  cardName: string | null
}): string {
  const { modelAccount, accounts, issuer, cardName } = opts
  if (modelAccount && accounts.includes(modelAccount)) return modelAccount

  const existing = accounts.filter((a) => a.startsWith('Liabilities:CreditCards:'))
  const noise = new Set(['bank', 'credit', 'card', 'cards', ...(issuer ? issuer.toLowerCase().split(/\s+/) : [])])
  const tokens = (cardName ?? '')
    .split(/[^A-Za-z0-9]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 4 && !noise.has(t))
  if (tokens.length > 0) {
    const hit = existing.find((a) => {
      const al = a.toLowerCase()
      return tokens.every((t) => al.includes(t))
    })
    if (hit) return hit
  }
  if (issuer && tokens.length > 0) {
    const leaf = tokens.map((t) => t[0]!.toUpperCase() + t.slice(1)).join('')
    return `Liabilities:CreditCards:${issuer}:${leaf}`
  }
  return sanitizeAccount(modelAccount ?? '', 'Liabilities:CreditCards:Unknown')
}

export function toLedgerEntries(opts: {
  extracted: ExtractedStatement
  rate: { pts: number; per: number } | null
  pool: { ticker: string | null; account: string | null } | null
  accounts: readonly string[]
  cardName: string | null
}): { transactions: TransactionInput[]; directives: DirectiveInput[] } {
  const { extracted, rate, pool } = opts
  const canEarn = rate !== null && pool?.ticker != null && pool?.account != null
  const pendingAcct = canEarn ? `${pool!.account}:Pending` : null
  // Issuer rides the pool account (Assets:Rewards:<Issuer>, owner convention).
  const issuer = pool?.account?.split(':').pop() ?? null
  const cardAccountFor = (modelAccount: string | null) =>
    resolveCardAccount({ modelAccount, accounts: opts.accounts, issuer, cardName: opts.cardName })

  const transactions: TransactionInput[] = []
  const directives: DirectiveInput[] = []

  for (const e of extracted.entries) {
    if (e.kind === 'balance') {
      const isPoints = e.currency.toUpperCase() === 'POINTS'
      if (isPoints && !canEarn) continue
      const amount = num(e.amount)
      if (amount === null) continue
      directives.push({
        kind: 'balance',
        date: e.date,
        account: isPoints ? pool!.account! : cardAccountFor(e.account),
        amount: isPoints ? String(Math.round(amount)) : fmt(amount),
        currency: isPoints ? pool!.ticker! : e.currency,
        plug_account: 'Equity:Adjustments',
      })
      continue
    }

    const txn = e.txn
    const rawTags = txn.tags ?? []
    const excluded = rawTags.includes(EXCLUDED_TAG)
    // Tags are for LINKING related entries (owner rule: refund ↔ original,
    // reversal pairs) — the earn-excluded signal is consumed here and
    // stripped; code never adds decorative tags.
    const tags = rawTags.filter((t) => t !== EXCLUDED_TAG)

    // Strip any model-emitted points legs (code owns those); sanitize
    // accounts; blank the card leg's amount → beancount auto-balances it.
    // Two sums, two jobs: the card leg balances against ALL non-card legs
    // (clearing/payment legs included); points accrue on Expenses legs only
    // (a payment's clearing leg must not read as a refund clawback).
    let legTotal = 0
    let spendTotal = 0
    const postings = txn.postings
      .filter(
        (p) =>
          !(pool?.account && p.account.startsWith(pool.account)) &&
          p.account !== 'Equity:Void',
      )
      .map((p) => {
        const isCard = p.account.startsWith('Liabilities:CreditCards')
        const amt = num(p.amount)
        if (!isCard && amt !== null) {
          let weight = 0
          if (p.price_at_signs === 2) {
            const total = num(p.price_amount)
            if (total !== null) weight = Math.sign(amt) * Math.abs(total)
          } else if (p.price_at_signs === 1) {
            const per = num(p.price_amount)
            if (per !== null) weight = amt * per
          } else if ((p.currency ?? 'INR') === 'INR') {
            weight = amt
          }
          legTotal += weight
          if (p.account.startsWith('Expenses:')) spendTotal += weight
        }
        return {
          ...p,
          account: isCard
            ? cardAccountFor(p.account)
            // Non-expense counter-legs (Assets:Clearing:CardPayments …) keep
            // their family; only unusable accounts fall back.
            : sanitizeAccount(p.account, p.account.startsWith('Assets:') ? 'Assets:Clearing:CardPayments' : 'Expenses:Misc'),
          ...(isCard ? { amount: null, currency: null } : {}),
        }
      })

    // Code computes the card leg: −(sum of INR weights, @@ prices included).
    // The model's own figure was discarded above — deterministic arithmetic,
    // explicit in review, and the draft validator sees a balanced entry.
    const cardLeg = postings.find((p) => p.account.startsWith('Liabilities:CreditCards'))
    if (cardLeg) {
      cardLeg.amount = fmt(-legTotal)
      cardLeg.currency = 'INR'
    }

    const out: TransactionInput = { ...txn, tags, postings }

    if (canEarn && !excluded && spendTotal !== 0) {
      const sign = spendTotal > 0 ? 1 : -1 // negative total = refund → claw back
      const pts = Math.floor(Math.abs(spendTotal) / rate!.per) * rate!.pts
      if (pts > 0) {
        out.postings.push(
          { account: pendingAcct!, amount: String(sign * pts), currency: pool!.ticker! },
          { account: 'Equity:Void', amount: String(-sign * pts), currency: pool!.ticker! },
        )
      }
    }

    transactions.push(out)
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
  instruction?: string | null
}): string {
  return `${opts.instruction?.trim() ? `User instruction: ${opts.instruction.trim()}\n\n` : ''}Existing ledger accounts:
${opts.accounts.join('\n')}

Card earn-exclusion rules:
${opts.cardRules ?? '(none known)'}

--- statement ---
${opts.statementText}`
}

// ---- Orchestration -------------------------------------------------------------

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
  statementText: string
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

  // 2. Extract as beancount-shaped entries (loose acceptors → canonical types).
  const ext = await genJson(
    deps.gen,
    ZStatement,
    deps.system,
    extractPrompt({
      statementText: deps.statementText,
      accounts: deps.accounts,
      cardRules: guide.ok ? (guide.logging_guide ?? guide.pool?.rate_notes ?? null) : null,
      instruction: deps.instruction,
    }),
    12288,
  )
  if (ext.value === null) {
    stages.extract = { txns: 0, balances: 0, error: ext.error ?? 'unknown' }
    return { ok: false, entries: [], error: `extract: ${ext.error}`, stages, validation_issues: [] }
  }
  const txns = ext.value.entries.filter((e) => e.kind === 'transaction').length
  stages.extract = { txns, balances: ext.value.entries.length - txns }

  // 3. Code: arbiter + canonical serialization.
  const parts = toLedgerEntries({
    extracted: ext.value,
    rate,
    pool: guide.ok ? guide.pool : null,
    accounts: deps.accounts,
    cardName: guide.ok ? guide.card.name : (cardRes.value?.card_name ?? null),
  })
  const entries = serializeEntries(parts)

  // 4. Validate. Failures don't block delivery (the review editor can fix
  //    them) but they are NEVER silent: full messages ride the result.
  const v = validateDraftBatch(entries)
  const validation_issues = v.ok === true ? [] : v.issues.map((i) => i.message)
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

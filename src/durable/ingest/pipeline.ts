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

export type GenFn = (opts: { system: string; prompt: string; maxTokens: number }) => Promise<string>

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
    const text = await gen({ system, prompt: p, maxTokens })
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
  const { extracted, pool } = opts
  // Issuer rides the pool account (Assets:Rewards:<Issuer>, owner convention).
  const issuer = pool?.account?.split(':').pop() ?? null
  const cardAccountFor = (modelAccount: string | null) =>
    resolveCardAccount({ modelAccount, accounts: opts.accounts, issuer, cardName: opts.cardName })

  const transactions: TransactionInput[] = []
  const directives: DirectiveInput[] = []

  for (const e of extracted.entries) {
    if (e.kind === 'balance') {
      // A model that emits real tickers needs no sentinel, but accept the
      // "POINTS" sentinel too and resolve it to the pool wallet/ticker.
      const isPoints = e.currency.toUpperCase() === 'POINTS'
      if (isPoints && (!pool?.account || !pool?.ticker)) continue
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
    const tags = rawTags.filter((t) => t !== EXCLUDED_TAG && t !== 'reward-accrual')

    // The model authors every posting now, including the points legs (the
    // validator rate-checks them and bounces repairs). Code does only the one
    // pure-mechanical thing it's strictly better at: blank the card leg's
    // amount so beancount auto-balances it against ALL non-card INR legs —
    // deterministic arithmetic the model fumbles on multi-leg forex. Points
    // legs (ticker currency) carry no INR weight, so they don't affect it.
    let legTotal = 0
    const postings = txn.postings.map((p) => {
      const isCard = p.account.startsWith('Liabilities:CreditCards')
      const amt = num(p.amount)
      // A card-statement "payment received" is unambiguous: money moves
      // from the float TO the card — the clearing leg is ALWAYS negative
      // (the model flips this often enough to legislate it in code).
      const isClearing = p.account.startsWith('Assets:Clearing:')
      const amtFixed = isClearing && amt !== null ? -Math.abs(amt) : amt
      if (!isCard && amtFixed !== null) {
        let weight = 0
        if (p.price_at_signs === 2) {
          const total = num(p.price_amount)
          if (total !== null) weight = Math.sign(amtFixed) * Math.abs(total)
        } else if (p.price_at_signs === 1) {
          const per = num(p.price_amount)
          if (per !== null) weight = amtFixed * per
        } else if ((p.currency ?? 'INR') === 'INR') {
          weight = amtFixed
        }
        legTotal += weight
      }
      return {
        ...p,
        ...(isClearing && amtFixed !== null ? { amount: fmt(amtFixed) } : {}),
        account: isCard
          ? cardAccountFor(p.account)
          // Non-expense counter-legs (rewards wallets, Equity:Void,
          // Assets:Clearing:CardPayments …) keep their family; only unusable
          // accounts fall back.
          : sanitizeAccount(p.account, p.account.startsWith('Assets:') ? 'Assets:Clearing:CardPayments' : 'Expenses:Misc'),
        ...(isCard ? { amount: null, currency: null } : {}),
      }
    })

    const cardLeg = postings.find((p) => p.account.startsWith('Liabilities:CreditCards'))
    if (cardLeg) {
      cardLeg.amount = fmt(-legTotal)
      cardLeg.currency = 'INR'
    }

    transactions.push({ ...txn, tags, postings })
  }

  return { transactions, directives }
}

// Rate-check the model's OWN points legs (it authors them now). The balance
// validator only proves entries balance — a wrong-but-balanced points figure
// (Pending +24 / Void −24 when the rate says 48) would slip through. So we
// keep the rate in CODE as a CHECKER: recompute the expected points and bounce
// a precise repair message back to the model. Skips entries with no Expenses
// leg (payments, transfers, the pending→posted landing) and earn-excluded
// ones. Authorship stays with the model; arithmetic stays guaranteed.
export function checkPointsArithmetic(
  extracted: ExtractedStatement,
  rate: { pts: number; per: number } | null,
  pool: { ticker: string | null; account: string | null } | null,
): string[] {
  if (!rate || !pool?.account || !pool?.ticker) return []
  const pendingAcct = `${pool.account}:Pending`
  const issues: string[] = []
  extracted.entries.forEach((e, idx) => {
    if (e.kind !== 'transaction') return
    const txn = e.txn
    if ((txn.tags ?? []).includes(EXCLUDED_TAG)) return
    let spend = 0
    let hasExpense = false
    for (const p of txn.postings) {
      if (!p.account.startsWith('Expenses:')) continue
      hasExpense = true
      const amt = num(p.amount)
      if (amt === null) continue
      if (p.price_at_signs === 2) {
        const t = num(p.price_amount)
        if (t !== null) spend += Math.sign(amt) * Math.abs(t)
      } else if (p.price_at_signs === 1) {
        const per = num(p.price_amount)
        if (per !== null) spend += amt * per
      } else if ((p.currency ?? 'INR') === 'INR') {
        spend += amt
      }
    }
    if (!hasExpense) return // payments, transfers, landings — no per-purchase earn
    const expected = Math.floor(Math.abs(spend) / rate.per) * rate.pts
    const want = (spend >= 0 ? 1 : -1) * expected
    const pend = txn.postings.find((p) => p.account === pendingAcct)
    const got = pend ? num(pend.amount) : null
    const where = `entry ${idx + 1} (${txn.date} "${txn.payee ?? ''}")`
    if (expected === 0) {
      if (got !== null && got !== 0)
        issues.push(`${where}: no points should accrue (spend below ${rate.per}); remove the ${got} ${pool.ticker} points legs`)
      return
    }
    if (got === null) {
      issues.push(`${where}: missing reward points — add ${want} ${pool.ticker} to ${pendingAcct} (floor(${Math.abs(spend)}/${rate.per})×${rate.pts}) with the matching Equity:Void contra`)
    } else if (got !== want) {
      issues.push(`${where}: reward points should be ${want} ${pool.ticker} (floor(${Math.abs(spend)}/${rate.per})×${rate.pts}), got ${got}`)
    }
  })
  return issues
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
  // The statement text (PDF extraction + vision OCR merged upstream).
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
    const ext = await genJson(deps.gen, ZStatement, deps.system, prompt, EXTRACT_MAX_TOKENS)
    if (ext.value === null) {
      lastExtractError = ext.error ?? 'unknown'
      stages.extract = { txns: 0, balances: 0, error: lastExtractError }
      continue
    }
    const txns = ext.value.entries.filter((e) => e.kind === 'transaction').length
    stages.extract = { txns, balances: ext.value.entries.length - txns }
    lastExtractError = null

    const parts = toLedgerEntries({
      extracted: ext.value,
      rate,
      pool: guide.ok ? guide.pool : null,
      accounts: deps.accounts,
      cardName: guide.ok ? guide.card.name : (cardRes.value?.card_name ?? null),
    })
    entries = serializeEntries(parts)
    const v = validateDraftBatch(entries)
    const balanceIssues = v.ok === true ? [] : v.issues.map((i) => i.message)
    // The validator works on the IR: balance + shape (serialized) AND the
    // rate-check on the model's own points legs. Both bounce to the model.
    const pointIssues = checkPointsArithmetic(ext.value, rate, guide.ok ? guide.pool : null)
    validation_issues = [...balanceIssues, ...pointIssues]
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

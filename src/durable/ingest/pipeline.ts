import { z } from 'zod'
import { fetchCardGuide, type CardGuideResult } from '../agents/tools/editor/card-guide'
import type { KbHttp } from '../agents/tools/concierge/kb-tools'

// Deterministic statement-ingest pipeline (owner decision after the agent-loop
// background drafter kept failing in model-shaped ways: runaway generations,
// tool-calls leaking as text, arithmetic bouncing off validation).
//
//   model CLASSIFIES, code COMPUTES.
//
// Two small JSON-only model calls (no tools, no streaming bulk payloads):
//   1. extract  — statement text → structured rows + stated balances
//   2. classify — merchants → expense accounts + exclusion flags (+ card acct)
// Everything load-bearing is code: beancount rendering, points math
// (floor blocks), refund mirroring, pad+balance bookends, sign conventions.

// ---- Extraction schema -------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const ExtractedTxn = z.object({
  date: z.string().regex(DATE_RE),
  merchant: z.string().min(1).max(120),
  // true when the row is a credit TO the card (refund/reversal) — not a spend.
  credit: z.boolean(),
  amount: z.number().positive(),
  note: z.string().max(160).optional(),
})

const StatedBalance = z.object({
  amount: z.number(),
  // credit balance — the bank owes the user → POSITIVE liability sign.
  cr: z.boolean().optional(),
  // true → a reward-points balance (asserted on the points wallet in the
  // pool's commodity); false/absent → fiat on the card account.
  points: z.boolean().optional(),
  // The date the statement states the balance for. Opening balances are
  // as-of the day before the period starts; closing as-of the period end.
  // Defaults to the period end when omitted.
  as_of: z.string().regex(DATE_RE).optional(),
})

const ExtractedStatement = z.object({
  card_name: z.string().min(2).max(80),
  period: z.object({ from: z.string().regex(DATE_RE), to: z.string().regex(DATE_RE) }),
  // Whatever balances the statement states — zero or more; fiat and points
  // are the same construct, just different accounts (owner convention).
  balances: z.array(StatedBalance).max(8).optional(),
  transactions: z.array(ExtractedTxn).min(1).max(200),
})
export type Extracted = z.infer<typeof ExtractedStatement>

const Classification = z.object({
  // Liability account for this card — an existing ledger account when one
  // matches, else a canonical Liabilities:CreditCards:<Issuer>:<Card> path.
  card_account: z.string().min(8),
  merchants: z
    .array(
      z.object({
        merchant: z.string(),
        account: z.string().min(8),
        // Earn-excluded per card rules (fuel, rent, wallet loads, government/tax).
        excluded: z.boolean(),
      }),
    )
    .min(1),
})
export type Classified = z.infer<typeof Classification>

// ---- JSON-only model calls ---------------------------------------------------

export type GenFn = (system: string, prompt: string, maxTokens: number) => Promise<string>

function firstJsonBlock(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (esc) {
      esc = false
      continue
    }
    if (c === '\\') {
      esc = inStr
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
          .slice(0, 3)
          .map((iss) => `${iss.path.join('.')}: ${iss.message}`)
          .join('; ')
      } catch (e) {
        lastError = `invalid JSON: ${String(e).slice(0, 120)}`
      }
    }
    p = `${prompt}\n\nYour previous output was invalid (${lastError}). Output ONLY the corrected JSON object.`
  }
  return { value: null, error: lastError }
}

// ---- Rate parsing (code, not model) ------------------------------------------

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

// ---- Rendering (pure code) ---------------------------------------------------

function money(n: number): string {
  return n.toFixed(2)
}

const SEGMENT_RE = /^[A-Z0-9][A-Za-z0-9-]*$/

export function sanitizeAccount(account: string, fallback: string): string {
  const parts = account.split(':').map((p) =>
    p
      .replace(/[^A-Za-z0-9-]/g, '')
      .replace(/^([a-z])/, (c) => c.toUpperCase()),
  )

  if (parts.length < 2 || !parts.every((p) => SEGMENT_RE.test(p))) return fallback
  return parts.join(':')
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days))
  return dt.toISOString().slice(0, 10)
}

function esc(s: string): string {
  return s.replace(/"/g, "'")
}

export function renderEntries(opts: {
  extracted: Extracted
  classified: Classified
  rate: { pts: number; per: number } | null
  pool: { ticker: string | null; account: string | null } | null
}): string[] {
  const { extracted, classified, rate, pool } = opts
  const cardAccount = sanitizeAccount(
    classified.card_account,
    'Liabilities:CreditCards:Unknown',
  )
  const byMerchant = new Map(
    classified.merchants.map((m) => [m.merchant.toLowerCase(), m]),
  )
  const canEarn = rate !== null && pool?.ticker != null && pool?.account != null
  const pending = canEarn ? `${pool!.account}:Pending` : null

  const entries: string[] = []

  // Stated balances: one uniform treatment — pad absorbs drift, assertion
  // pins the statement's figure. Assertions check the START of day, so the
  // assert date is as_of + 1 with the pad on as_of. Fiat lands on the card
  // account (Cr → positive); points on the pool wallet in its commodity
  // (skipped when the pool is unknown).
  for (const bal of extracted.balances ?? []) {
    const asOf = bal.as_of ?? extracted.period.to
    if (bal.points) {
      if (!pool?.account || !pool?.ticker) continue
      entries.push(
        `${asOf} pad ${pool.account} Equity:Opening-Balances\n` +
          `${addDays(asOf, 1)} balance ${pool.account}  ${Math.round(bal.amount)} ${pool.ticker}`,
      )
    } else {
      const signed = bal.cr ? bal.amount : -bal.amount
      entries.push(
        `${asOf} pad ${cardAccount} Equity:Opening-Balances\n` +
          `${addDays(asOf, 1)} balance ${cardAccount}  ${money(signed)} INR`,
      )
    }
  }

  for (const t of extracted.transactions) {
    const cls = byMerchant.get(t.merchant.toLowerCase())
    const expense = sanitizeAccount(cls?.account ?? 'Expenses:Misc', 'Expenses:Misc')
    const excluded = cls?.excluded ?? false
    const sign = t.credit ? -1 : 1
    const narration = t.credit ? `Refund — ${esc(t.note ?? '')}`.trim() : esc(t.note ?? '')

    const lines = [
      `${t.date} * "${esc(t.merchant)}" "${narration}"`,
      `  ${expense}  ${money(sign * t.amount)} INR`,
      `  ${cardAccount}  ${money(-sign * t.amount)} INR`,
    ]
    if (canEarn && !excluded) {
      const pts = Math.floor(t.amount / rate!.per) * rate!.pts
      if (pts > 0) {
        lines[0] += '  #reward-accrual'
        lines.push(`  ${pending}  ${sign * pts} ${pool!.ticker}`)
        lines.push(`  Equity:Void  ${-sign * pts} ${pool!.ticker}`)
      }
    }
    entries.push(lines.join('\n'))
  }

  return entries
}

// ---- Prompts -----------------------------------------------------------------

const EXTRACT_SYSTEM = `You extract credit-card statements into JSON. Output ONLY a JSON object, no prose, matching:
{
  "card_name": "issuer + card name as printed",
  "period": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" },
  "balances": [ { "amount": 123.45, "cr": false, "points": false, "as_of": "YYYY-MM-DD" } ],
  "transactions": [
    { "date": "YYYY-MM-DD", "merchant": "as printed", "credit": false, "amount": 123.45, "note": "short category hint" }
  ]
}
Rules:
- amount is ALWAYS positive; "credit": true marks refunds/reversals TO the card.
- balances: every balance the statement STATES, zero or more. "cr": true when marked Cr (credit balance — the bank owes the user). "points": true for reward-point balances. "as_of": the date the figure is stated for — opening balances are as-of the day BEFORE the period starts, closing as-of the period end.
- Copy stated amounts digit-for-digit. Normalize all dates to YYYY-MM-DD.
- SKIP noise rows: payments received, reward-point summaries, interest/late fees, GST-on-fee lines, promotional text.
- Include every purchase and every refund/credit row.`

function extractPrompt(statementText: string, instruction?: string | null): string {
  return `${instruction?.trim() ? `User instruction: ${instruction.trim()}\n\n` : ''}--- statement ---\n${statementText}`
}

const CLASSIFY_SYSTEM = `You map credit-card merchants to ledger expense accounts. Output ONLY a JSON object:
{
  "card_account": "Liabilities:CreditCards:...",
  "merchants": [ { "merchant": "...", "account": "Expenses:...", "excluded": false } ]
}
Rules:
- card_account: pick the EXISTING ledger account matching the card when one exists; otherwise propose Liabilities:CreditCards:<Issuer>:<CardName>.
- account: an existing Expenses:* account when one fits, else a sensible canonical one (Expenses:Food:Restaurants, Expenses:Shopping:..., Expenses:Transport:Fuel, Expenses:Software:Subscriptions, ...).
- excluded: true when the card earns NO points on this merchant category per the card rules (fuel, rent, wallet loads, government/tax payments).
- Cover EVERY merchant you are given, exactly once, name copied verbatim.`

function classifyPrompt(opts: {
  merchants: string[]
  cardName: string
  accounts: readonly string[]
  cardRules: string | null
}): string {
  return `Card: ${opts.cardName}
Card earn rules:
${opts.cardRules ?? '(none known)'}

Existing ledger accounts:
${opts.accounts.join('\n')}

Merchants to classify:
${opts.merchants.join('\n')}`
}

// ---- Orchestration -----------------------------------------------------------

export type PipelineResult = {
  ok: boolean
  entries: string[]
  error?: string
  stages: {
    extract?: { txns: number; period?: string; card?: string; error?: string }
    guide?: { found: boolean; rate?: string; error?: string }
    classify?: { merchants: number; cardAccount?: string; error?: string }
  }
}

export async function runDraftPipeline(deps: {
  gen: GenFn
  kb: KbHttp
  statementText: string
  accounts: readonly string[]
  instruction?: string | null
}): Promise<PipelineResult> {
  const stages: PipelineResult['stages'] = {}

  // 1. Extract — the only step that reads the raw statement.
  const ext = await genJson(
    deps.gen,
    ExtractedStatement,
    EXTRACT_SYSTEM,
    extractPrompt(deps.statementText, deps.instruction),
    8192,
  )
  if (ext.value === null) {
    stages.extract = { txns: 0, error: ext.error ?? 'unknown' }
    return { ok: false, entries: [], error: `extract: ${ext.error}`, stages }
  }
  const extracted = ext.value
  stages.extract = {
    txns: extracted.transactions.length,
    period: `${extracted.period.from}..${extracted.period.to}`,
    card: extracted.card_name,
  }

  // 2. Card guide + base rate — pure code from here on.
  const guide = await fetchCardGuide(deps.kb, extracted.card_name)
  const rate = parseBaseRate(guide)
  stages.guide = {
    found: guide.ok,
    rate: rate ? `${rate.pts}/${rate.per}` : undefined,
    error: guide.ok ? undefined : (guide as { error?: string }).error,
  }

  // 3. Classify merchants (unique, order-stable).
  const merchants = [...new Set(extracted.transactions.map((t) => t.merchant))]
  const cls = await genJson(
    deps.gen,
    Classification,
    CLASSIFY_SYSTEM,
    classifyPrompt({
      merchants,
      cardName: extracted.card_name,
      accounts: deps.accounts,
      cardRules: guide.ok ? (guide.logging_guide ?? guide.pool?.rate_notes ?? null) : null,
    }),
    4096,
  )
  if (cls.value === null) {
    stages.classify = { merchants: merchants.length, error: cls.error ?? 'unknown' }
    return { ok: false, entries: [], error: `classify: ${cls.error}`, stages }
  }
  stages.classify = {
    merchants: cls.value.merchants.length,
    cardAccount: cls.value.card_account,
  }

  // 4. Render — deterministic.
  const entries = renderEntries({
    extracted,
    classified: cls.value,
    rate,
    pool: guide.ok ? guide.pool : null,
  })
  return { ok: true, entries, stages }
}

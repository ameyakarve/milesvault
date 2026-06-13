import { z } from 'zod'
import {
  fetchCardGuideBySlug,
  listCards,
  type CardGuideResult,
} from '../agents/tools/editor/card-guide'
import type { KbHttp } from '../agents/tools/concierge/kb-tools'
import { validateDraftBatch } from '@/lib/beancount/validate-draft-batch'
import {
  ZEntry,
  type ExtractedEntry,
  serializeIrEntry,
  toLedgerEntries,
  serializeEntries,
} from './ir'

// Re-exported for external consumers (eval harness) that imported them from here
// before the IR was extracted into ./ir.
export { toLedgerEntries, serializeEntries }
export type { ExtractedEntry }

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

// The draft IR (entry schemas, helpers, serializer) lives in ./ir and is shared
// VERBATIM with the editor's draft_transaction tool — one definition of an
// entry, no drifting mirrors. Only the statement wrapper is pipeline-specific:
const ZStatement = z.object({
  card_name: z.string().min(2).max(80),
  entries: z.array(ZEntry).min(1).max(250),
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

// ---- Prompts -------------------------------------------------------------------

// Closed-set card identification: the model matches the statement against the
// FULL KG card list and returns the exact slug — no fuzzy resolution, no
// filler-word ("Bank", "Credit Card") dilution that mis-resolved cards like
// "Swiggy HDFC Bank Credit Card" / "IndusInd Bank Platinum RuPay Credit Card".
const ZCard = z.object({
  card_name: z.string().min(2).max(80).nullable(),
  slug: z.string().nullable(),
})
function buildCardSystem(cards: ReadonlyArray<{ slug: string; name: string }>): string {
  return `Identify which credit card this statement belongs to. Match the statement's issuer + product name to the SINGLE best entry in the list below. Output ONLY JSON: {"card_name":"<that card's name>","slug":"<its exact slug from the list>"}. If none of the listed cards match, output {"card_name":null,"slug":null}.

Known cards — "Name [slug]":
${cards.map((c) => `${c.name} [${c.slug}]`).join('\n')}`
}

// The card list is static per deploy — load once per worker. A failed load is
// not cached (so it retries next statement), and an empty list degrades to the
// old fuzzy-by-name path rather than breaking every card.
let cardListCache: Promise<Array<{ slug: string; name: string }>> | null = null
const getCardList = (kb: KbHttp): Promise<Array<{ slug: string; name: string }>> =>
  (cardListCache ??= listCards(kb).catch((): Array<{ slug: string; name: string }> => {
    cardListCache = null
    return []
  }))

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
  'The attached images are the pages of a credit-card statement, and below is the text already extracted from the PDF. PREFER THE TEXT: it is reliable for anything legible in it (dates, amounts, merchant names) — use it as the source of truth there. Use the IMAGES only to read what the text is missing or garbled (e.g. labels the bank renders as images, like the reward-points summary). Output the single JSON object of entries per the rules above. EVERY eligible purchase is FOUR postings — expense + card + `<pool>:Pending` points accrual + `Equity:Void` — do NOT drop the points legs, especially on a long statement where they are the first thing to slip. Include every transaction WITH its points legs, every stated balance, and the reward-points balance.'

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
  // Lightweight, NON-thinking gen for the small card-identify / pick calls
  // (thinking starves their 256-token budget). Falls back to `gen`.
  genFast?: GenFn
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

  const genFast = deps.genFast ?? deps.gen

  // 1. Identify the card → resolve its guide (rate, pool, exclusions).
  //    (A) The identify call runs on the NON-thinking gen — its 256-token
  //    budget gets starved by a thinking trace.
  const cards = await getCardList(deps.kb)
  const cardRes = await genJson(
    genFast,
    ZCard,
    buildCardSystem(cards),
    deps.statementText.slice(0, 4000),
    256,
  )
  stages.card = { name: cardRes.value?.card_name ?? undefined, error: cardRes.error ?? undefined }

  // The model picked the card from the full KG card list (closed set); resolve
  // its guide by that exact slug. No anchor, no fuzzy matching, no candidate
  // re-pick — the model decides which card this is, and the extraction step
  // matches each transaction to the user's existing accounts via the
  // open-accounts list. (CLAUDE.md: this pipeline is LLM-first; code does not
  // arbitrate the model's choices.)
  const pickedSlug =
    cardRes.value?.slug && cards.some((c) => c.slug === cardRes.value!.slug)
      ? cardRes.value.slug
      : null
  const guide: CardGuideResult = pickedSlug
    ? await fetchCardGuideBySlug(
        deps.kb,
        pickedSlug,
        cards.find((c) => c.slug === pickedSlug)?.name ?? null,
      )
    : { ok: false, error: 'card_not_identified' }
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
  // Send the FULL earn rules the guide carries — the prose AND the per-MCC
  // EARN_RULE edges (the precise exclusions + which categories earn). Without
  // the edges, the model only sees vague prose ("no fuel") and mis-classifies
  // utilities (e.g. a piped-gas bill) as fuel.
  const cardRules = guide.ok
    ? [
        guide.logging_guide ?? guide.pool?.rate_notes,
        guide.overrides.length
          ? 'Per-category earn rules (from the card guide):\n' +
            guide.overrides
              .map((o) => `- ${o.name ?? o.mcc}: ${o.rule ?? '(see guide)'}`)
              .join('\n')
          : null,
      ]
        .filter(Boolean)
        .join('\n\n') || null
    : null
  const basePrompt = extractPrompt({
    statementText: deps.statementText,
    accounts: deps.accounts,
    cardRules,
    pool: guide.ok ? guide.pool : null,
    rate,
    instruction: deps.instruction,
  })
  // Surgical extraction: parse entries individually, KEEP the good ones by id,
  // and re-request ONLY the bad ones (by id). One malformed entry no longer
  // costs a full-batch regeneration, and the entry an error names stays the
  // same entry on the retry (the index-instability we measured caused the
  // 3-round, 15-minute runs).
  const accepted = new Map<string, ExtractedEntry>()
  let validation_issues: string[] = []
  let prompt = basePrompt
  let lastExtractError: string | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const text = await deps.gen({
      system: deps.system,
      prompt,
      maxTokens: EXTRACT_MAX_TOKENS,
      images: deps.images,
    })
    const block = firstJsonBlock(text)
    if (!block) {
      lastExtractError = 'no JSON object in output'
      continue
    }
    let rawEntries: unknown[]
    try {
      const obj = JSON.parse(block) as { entries?: unknown }
      rawEntries = Array.isArray(obj.entries) ? obj.entries : []
    } catch (e) {
      lastExtractError = `invalid JSON: ${String(e)}`
      continue
    }
    lastExtractError = null

    const bad: { id: string; msg: string }[] = []
    rawEntries.forEach((raw, i) => {
      // Read the id off the RAW entry so even a malformed one is addressable.
      const r0 = raw as { id?: unknown } | null
      const id = r0 && typeof r0.id === 'string' && r0.id ? r0.id : `e${i}`
      const parsed = ZEntry.safeParse(raw)
      if (parsed.success) accepted.set(id, parsed.data)
      else
        bad.push({
          id,
          msg: parsed.error.issues.map((iss) => `${iss.path.join('.')}: ${iss.message}`).join('; '),
        })
    })

    // Render the accepted set, run the GENERIC validator, map each issue back
    // to its entry id (validateDraftBatch reports by index).
    const idOrder = [...accepted.keys()]
    const rendered = [...accepted.values()].map(serializeIrEntry)
    const v = validateDraftBatch(rendered)
    if (v.ok === false)
      for (const iss of v.issues) bad.push({ id: idOrder[iss.index] ?? '?', msg: iss.message })

    const all = [...accepted.values()]
    stages.extract = {
      txns: all.filter((e) => e.kind === 'transaction').length,
      balances: all.filter((e) => e.kind === 'balance' || e.kind === 'pad').length,
    }
    validation_issues = bad.map((b) => `id ${b.id}: ${b.msg}`)
    if (bad.length === 0) break

    // Surgical re-request: ONLY the listed entries, by id; keep the rest.
    prompt =
      `${basePrompt}\n\nSome entries are INVALID. Return a JSON object {"entries":[...]} containing ONLY corrected versions of the entries listed below — keep each one's SAME "id", and do NOT resend any other entry:\n` +
      bad.map((b) => `- id "${b.id}": ${b.msg}`).join('\n')
  }
  const entries = [...accepted.values()].map(serializeIrEntry)
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

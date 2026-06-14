import { z } from 'zod'
import {
  fetchCardGuideBySlug,
  listCards,
  type CardGuideResult,
} from '../agents/tools/editor/card-guide'
import type { KbHttp } from '../agents/tools/concierge/kb-tools'
import { validateDraftBatch } from '@/lib/beancount/validate-draft-batch'

// Statement-ingest pipeline.
//
//   The MODEL emits complete beancount text; code validates and stores it.
//
// There is no intermediate representation: the model emits an array of
// { id, text } entries where each `text` is ONE beancount entry (the same shape
// the editor's draft_transaction tool takes). The `id` is a transient handle so
// a correction can be re-requested surgically — it never enters the ledger.
//
// Code is NOT an arbiter (owner ruling): it does not compute card legs, points
// or signs, does not rewrite accounts, and does not inject any plug or tag. The
// model authors every posting, guided by the shared prompt (which carries the
// card's rate, pool and the existing accounts). Code only runs the GENERIC
// validator (parse + per-currency balance + account shape + no silently-dropped
// postings + no elided amounts) — whose findings bounce verbatim back to the
// model. Same conventions as the editor; the only delta is the output channel
// (a JSON envelope of beancount texts here vs the draft_transaction tool there).

// The model emits the SAME { id, text } entries the editor's draft_transaction
// tool takes, wrapped in a JSON envelope: { card_name, entries: [{ id, text }] }.
// The envelope is parsed leniently in the extract loop (manual JSON.parse so a
// single malformed entry can be re-requested by id without rejecting the batch).

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

export async function genJson<T>(
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
  instruction?: string | null
}): string {
  const reward =
    opts.pool?.account && opts.pool?.ticker
      ? `Reward programme for this card (emit the points legs yourself, per the Points pattern):
- points account: ${opts.pool.account}  (earn → ${opts.pool.account}:Pending; posted/landed → ${opts.pool.account})
- points commodity (ticker): ${opts.pool.ticker}
- compute the points earned on each eligible purchase from the card's earn rules below — do NOT guess a rate.`
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

export type PipelineResult = {
  ok: boolean
  entries: string[]
  error?: string
  stages: {
    card?: { name?: string; error?: string }
    guide?: { found: boolean; error?: string }
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
  // The shared convention stack (buildStatementTextSystem) — injected so this
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
  stages.guide = {
    found: guide.ok,
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
    instruction: deps.instruction,
  })
  // Surgical extraction: parse entries individually, KEEP the good ones by id,
  // and re-request ONLY the bad ones (by id). One malformed entry no longer
  // costs a full-batch regeneration, and the entry an error names stays the
  // same entry on the retry (the index-instability we measured caused the
  // 3-round, 15-minute runs).
  const accepted = new Map<string, string>()
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
      // Read the id off the RAW entry so a malformed one is still addressable.
      const r0 = raw as { id?: unknown; text?: unknown } | null
      const id = r0 && typeof r0.id === 'string' && r0.id ? r0.id : `e${i}`
      const entryText = r0 && typeof r0.text === 'string' ? r0.text : ''
      if (!entryText.trim()) bad.push({ id, msg: 'missing "text" (the beancount entry)' })
      else accepted.set(id, entryText)
    })

    // Run the GENERIC validator on the accepted texts in id order, mapping each
    // issue back to its entry id (validateDraftBatch reports by index). No
    // serialization, no rewriting — the model's text is validated as-is.
    const idOrder = [...accepted.keys()]
    const v = validateDraftBatch([...accepted.values()])
    if (v.ok === false)
      for (const iss of v.issues) bad.push({ id: idOrder[iss.index] ?? '?', msg: iss.message })

    const all = [...accepted.values()]
    const isBalance = (t: string) => /^\s*\d{4}-\d{2}-\d{2}\s+(balance|pad)\b/m.test(t)
    stages.extract = {
      txns: all.filter((t) => !isBalance(t)).length,
      balances: all.filter(isBalance).length,
    }
    validation_issues = bad.map((b) => `id ${b.id}: ${b.msg}`)
    if (bad.length === 0) break

    // Surgical re-request: ONLY the listed entries, by id; keep the rest.
    prompt =
      `${basePrompt}\n\nSome entries are INVALID. Return a JSON object {"entries":[...]} containing ONLY corrected versions of the entries listed below — keep each one's SAME "id", and do NOT resend any other entry:\n` +
      bad.map((b) => `- id "${b.id}": ${b.msg}`).join('\n')
  }
  const entries = [...accepted.values()]
  if (lastExtractError !== null && entries.length === 0) {
    return { ok: false, entries: [], error: `extract: ${lastExtractError}`, stages, validation_issues: [] }
  }
  if (!guide.ok) {
    validation_issues.unshift(
      `Reward points OMITTED: card guide not found for "${cardRes.value?.card_name ?? '?'}" (${(guide as { error?: string }).error ?? 'unknown'}${guide.ok === false && guide.candidates ? `; candidates: ${guide.candidates.map((c) => c.name).join(', ')}` : ''})`,
    )
  }
  stages.validate = { issues: validation_issues.length }

  return { ok: entries.length > 0, entries, stages, validation_issues }
}

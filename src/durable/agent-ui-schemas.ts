import { z } from 'zod'
import { validateDraftBatch } from '@/lib/beancount/validate-draft-batch'
import { entryFeedback } from '@/lib/beancount/draft-feedback'
import { ZEntry, serializeIrEntries } from './ingest/ir'

// The agent emits one or more drafted entries inside a `draft_transaction` tool
// call as STRUCTURED IR — the SAME `ZEntry` the headless statement pipeline
// uses (a transaction is a header + typed postings; a stated balance is a
// `balance`/`pad` entry). The model fills fields (account, amount, currency,
// price) instead of hand-writing beancount text, so it cannot fumble syntax,
// indentation, or `@@` weight mechanics. Code serializes the IR to canonical
// beancount; the user reviews each entry in a per-card CodeMirror editor and
// approves; we then concatenate the (possibly hand-edited) text and replaceBuffer.
//
// superRefine serializes the IR and runs the same generic validators
// replaceBuffer runs (parse + per-currency balance + account shape). On failure
// the AI SDK surfaces the issue to the model as a tool input-error; the repair
// hook (chat-do) turns it into compact, example-rich feedback and the model
// re-emits in the same turn. Requires `dynamicTool` registration — static tools
// with invalid input get silently dropped by the SDK, never reaching the model.
export const draftTransactionBatchSchema = z
  .object({
    entries: z
      .array(ZEntry)
      .min(1)
      .max(250)
      .describe(
        'Array of structured draft entries (the same IR the statement importer emits). ' +
          'A one-off is an array of length 1; statement uploads / splits / subscription ' +
          'series go in the same call. Each entry needs a unique short `id`.',
      ),
  })
  .superRefine((value, ctx) => {
    // value.entries are post-transform ExtractedEntry[]; serialize to canonical
    // beancount and validate balance/shape. Each issue is added per-entry with
    // an example for its failure class. The SDK surfaces these to the model on
    // the standard tool-input-validation path — no separate feedback channel.
    //
    // zod runs superRefine even when some entries already FAILED the shape stage
    // (their field issues are on the error). Those entries didn't transform, so
    // serialization would throw — guard it and skip the balance check; the shape
    // errors stand on their own.
    let texts: string[]
    try {
      texts = serializeIrEntries(value.entries)
    } catch {
      return
    }
    const result = validateDraftBatch(texts)
    if (result.ok === true) return
    for (const issue of result.issues) {
      ctx.addIssue({
        code: 'custom',
        path: ['entries', issue.index],
        message: entryFeedback(texts[issue.index] ?? '', issue.message),
      })
    }
  })

export type DraftTransactionBatch = z.infer<typeof draftTransactionBatchSchema>

// Ask the user a clarifying question when the agent can't decide between
// genuinely ambiguous paths (e.g. instant discount vs separately-redeemable
// cashback). The agent picks the shape — multi_select for "all that apply",
// allow_custom for "let me type my own". The card resolves the tool call.
export const clarifyInputSchema = z.object({
  question: z.string().describe('The question shown to the user.'),
  options: z
    .array(z.string())
    .default([])
    .describe(
      'Suggested answers. May be empty (free-text only). Keep short — these become clickable chips.',
    ),
  multi_select: z
    .boolean()
    .default(false)
    .describe('If true, render as checkboxes; otherwise radio.'),
  allow_custom: z
    .boolean()
    .default(true)
    .describe('If true, show a free-text input alongside the options.'),
})

export const clarifyOutputSchema = z.object({
  answers: z.array(z.string()).min(1),
})

export type ClarifyInput = z.infer<typeof clarifyInputSchema>

// add_card — the KG-backed card picker. The agent may pre-seed candidates
// it already resolved; the component searches the KG live regardless.
export const addCardInputSchema = z.object({
  // Short context line shown above the picker ("Which card should I add?").
  prompt: z.string().max(200).optional(),
  candidates: z
    .array(z.object({ slug: z.string(), name: z.string().nullable() }))
    .max(8)
    .optional(),
})
export type AddCardInput = z.infer<typeof addCardInputSchema>
export type ClarifyOutput = z.infer<typeof clarifyOutputSchema>

// The agent emits a `show_award_options` tool call with only the city pair and
// the funding source (a card or currency). The gen-UI renders a link into the
// chat that opens the /explore Award Explorer with origin + destination
// prefilled; that page computes and lets the user filter the full option set.
// The agent never sees, prices, or orders any rows — it only passes these args.
export const showAwardOptionsSchema = z.object({
  origin: z.string().describe('Origin airport IATA, e.g. "BLR".'),
  destination: z.string().describe('Destination airport IATA, e.g. "NRT".'),
  source: z
    .string()
    .describe(
      'The funding card or currency — a free-text name or a KB slug ' +
        '(e.g. "Axis Magnus Burgundy" or "currency/edge-rewards-burgundy"). ' +
        'The per-cabin points cost is computed by transferring from this.',
    ),
})

export type ShowAwardOptionsInput = z.infer<typeof showAwardOptionsSchema>

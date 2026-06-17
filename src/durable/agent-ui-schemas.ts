import { z } from 'zod'
import { classifyDraftEntry } from '@/lib/beancount/validate-draft-batch'
import { entryFeedback } from '@/lib/beancount/draft-feedback'

// The agent emits one or more drafted entries inside a `draft_transaction` tool
// call as BEANCOUNT TEXT — one entry per array element, the SAME representation
// the headless statement pipeline emits (a transaction is a date header + its
// posting lines; a stated balance is a `balance` line, optionally preceded by
// its `pad`). Each element carries a short `id` so a correction can be surgical
// (re-request that id) — the id is a transient handle and never enters the
// ledger. The user reviews each entry in a per-card CodeMirror editor and
// approves; we then concatenate the (possibly hand-edited) text and replaceBuffer.
//
// superRefine runs the same generic validators replaceBuffer runs (parse +
// per-currency balance + account shape + no-silent-drops + no-eliding) on each
// entry's text. On failure the AI SDK surfaces the issue to the model as a tool
// input-error; entryFeedback turns it into compact, example-rich feedback and
// the model re-emits in the same turn. Requires `dynamicTool` registration —
// static tools with invalid input get silently dropped by the SDK, never
// reaching the model.
export const draftTransactionBatchSchema = z
  .object({
    entries: z
      .array(
        z.object({
          id: z
            .string()
            .min(1)
            .max(24)
            .describe('A short, unique handle for this entry (e.g. "t1", "b1") — used only to address it on a correction; never written to the ledger.'),
          text: z
            .string()
            .default('')
            .describe('The NEW beancount entry as text (a transaction, or a stated balance with optional `pad`). Present for an add or an edit; leave EMPTY for a delete.'),
          replaces: z
            .string()
            .optional()
            .describe('To EDIT or DELETE an existing entry: the exact beancount text being replaced, copied verbatim from the `incorporate` result. Omit for a brand-new entry. (edit = replaces + new text · delete = replaces + empty text · add = text only.)'),
        }),
      )
      .min(1)
      .max(250)
      .describe(
        'Array of draft entries — add (text only), edit (replaces + new text), or delete (replaces, empty text). ' +
          'A one-off is length 1; statement uploads / splits / subscription series / bulk edits go in the same call.',
      ),
  })
  .superRefine((value, ctx) => {
    // Reject duplicate ids: the pipeline keys entries by id, so a repeat would
    // silently overwrite — surfaced here rather than swallowed.
    const firstSeen = new Map<string, number>()
    value.entries.forEach((e, i) => {
      const prev = firstSeen.get(e.id)
      if (prev !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['entries', i, 'id'],
          message: `duplicate id "${e.id}" (also entry ${prev + 1}) — each entry needs a unique id`,
        })
      } else {
        firstSeen.set(e.id, i)
      }
    })
    // Validate the NEW text per entry (the SAME validator replaceBuffer uses):
    //  - delete (empty text + `replaces`): nothing to validate.
    //  - add / edit (text present): classify it (parse + per-currency balance +
    //    account shape + no silent drops + no eliding).
    //  - empty text with no `replaces`: not an entry at all — surface it.
    // `replaces` is existing ledger text (already valid) — matched to a real
    // entry at write time; nothing to validate here.
    value.entries.forEach((e, i) => {
      if (e.text.trim().length === 0) {
        if (e.replaces == null || e.replaces.trim().length === 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['entries', i, 'text'],
            message:
              'an entry needs `text` (a new or edited entry) OR a `replaces` with empty text (to delete an existing entry)',
          })
        }
        return // delete — no new text to validate
      }
      const verdict = classifyDraftEntry(e.text, `entry ${i + 1}`)
      if (verdict.kind === 'ok') return
      for (const message of verdict.messages) {
        ctx.addIssue({
          code: 'custom',
          path: ['entries', i, 'text'],
          message: entryFeedback(e.text, message),
        })
      }
    })
  })

export type DraftTransactionBatch = z.infer<typeof draftTransactionBatchSchema>
// NB: the RECORDING (statement-ingest) variant uses an id→text MAP, declared via
// `jsonSchema()` in editor/draft-transaction.ts — NOT Zod. Zod-4's `z.record`
// mis-converts to `additionalProperties:false` (drops the value type), which
// sends the model a schema that rejects every object.

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

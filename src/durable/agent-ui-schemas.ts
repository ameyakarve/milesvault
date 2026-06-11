import { z } from 'zod'
import { validateDraftBatch } from '@/lib/beancount/validate-draft-batch'

// The agent emits one or more drafted transactions inside a `draft_transaction`
// tool call. Each element is a complete Beancount entry (date / payee / narration
// header + 2+ postings) — the model writes Beancount syntax directly so it can
// use `@@` (forex), `@`, cost basis, metadata, and tags without us re-modelling
// each feature in a JSON schema. The user reviews each entry in a per-card
// CodeMirror editor and approves the batch; we then concatenate and replaceBuffer.
//
// superRefine runs the same beancount validators replaceBuffer runs at the
// journal-write boundary (parse + per-currency balance + account shape). When
// it fails, the AI SDK surfaces the zod issues back to the model as a tool
// input-error and the model re-emits in the same turn. Requires the tool to
// be registered with `dynamicTool` — static tools with invalid input get
// silently dropped by the SDK, never reaching the model.
export const draftTransactionBatchSchema = z
  .object({
    transactions: z
      .array(
        z
          .string()
          .min(1)
          .describe(
            'One complete Beancount transaction as text. Example:\n' +
              '2026-05-13 * "Cloudflare" "Workers subscription"\n' +
              '  Expenses:Software:Subscriptions    2.36 USD @@ 225.98 INR\n' +
              '  Expenses:Bank:ForexMarkup          4.52 INR\n' +
              '  Expenses:Tax:GST                   0.81 INR\n' +
              '  Liabilities:CreditCards:Axis:Magnus -231.31 INR',
          ),
      )
      .min(1)
      .describe(
        'Array of Beancount transaction strings. One-off entries are an array of length 1; ' +
          'statement uploads / splits / subscription series go in the same call.',
      ),
  })
  .superRefine((value, ctx) => {
    const result = validateDraftBatch(value.transactions)
    if (result.ok === true) return
    for (const issue of result.issues) {
      ctx.addIssue({
        code: 'custom',
        path: ['transactions', issue.index],
        message: issue.message,
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

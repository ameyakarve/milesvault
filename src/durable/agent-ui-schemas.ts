import { z } from 'zod'

// The agent emits one or more drafted transactions inside a `draft_transaction`
// tool call. Each element is a complete Beancount entry (date / payee / narration
// header + 2+ postings) — the model writes Beancount syntax directly so it can
// use `@@` (forex), `@`, cost basis, metadata, and tags without us re-modelling
// each feature in a JSON schema. The user reviews each entry in a per-card
// CodeMirror editor and approves the batch; we then concatenate and replaceBuffer.
export const draftTransactionBatchSchema = z.object({
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
export type ClarifyOutput = z.infer<typeof clarifyOutputSchema>

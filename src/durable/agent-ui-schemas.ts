import { z } from 'zod'

// Single-transaction draft. The agent emits this as a client-side tool call;
// the user reviews / edits / approves in DraftTransactionCard. Amounts are
// signed plain numbers — the card formats and the client serializes back to
// Beancount text before PUT /api/ledger/journal.
export const draftTransactionSchema = z.object({
  date: z.string().describe('YYYY-MM-DD posting date'),
  flag: z
    .enum(['*', '!'])
    .optional()
    .describe('* = cleared (default), ! = needs review'),
  payee: z.string().optional(),
  narration: z.string().optional(),
  postings: z
    .array(
      z.object({
        account: z
          .string()
          .describe('Full Beancount account, e.g. "Expenses:Food:Groceries"'),
        amount: z
          .number()
          .describe('Signed amount; postings must sum to zero per currency'),
        currency: z.string().describe('ISO 4217 code, e.g. "USD"'),
      }),
    )
    .min(2)
    .describe('Two or more balanced postings.'),
})

export type DraftTransaction = z.infer<typeof draftTransactionSchema>
export type DraftPosting = DraftTransaction['postings'][number]

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

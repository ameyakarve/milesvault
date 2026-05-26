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

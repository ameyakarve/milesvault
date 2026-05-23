import { z } from 'zod'

export const showVegaSchema = z.object({
  title: z
    .string()
    .optional()
    .describe('Optional title rendered above the chart.'),
  spec: z
    .record(z.string(), z.unknown())
    .describe(
      'A complete Vega-Lite v5 spec object. Embed data inline as `data.values` (the server has no fetch). Set `width: "container"` so the chart fills the chat. The renderer wraps a card around it and injects sensible default axis/legend colors — do NOT also add a title; use the top-level `title` field of this tool.',
    ),
})
export type ShowVegaProps = z.infer<typeof showVegaSchema>

export const accountCardSchema = z.object({
  account: z
    .string()
    .describe('Full Beancount account path, e.g. "Assets:Bank:Chase:Checking"'),
  currency: z.string().describe('ISO 4217 code, e.g. "USD"'),
  balance: z.number().describe('Current balance as a plain number'),
  as_of_date: z
    .string()
    .optional()
    .describe('YYYY-MM-DD the balance is computed for'),
  recent_txns: z
    .array(
      z.object({
        date: z.string().describe('YYYY-MM-DD'),
        payee: z.string().optional(),
        narration: z.string().optional(),
        amount: z
          .number()
          .describe(
            'Signed amount posted to this account (positive = inflow, negative = outflow)',
          ),
        counterparty: z
          .string()
          .optional()
          .describe('Other side of the txn, e.g. "Expenses:Food:Groceries"'),
      }),
    )
    .max(15)
    .optional(),
})
export type AccountCardProps = z.infer<typeof accountCardSchema>

export const proposeJournalEditSchema = z.object({
  instruction: z
    .string()
    .describe(
      'Short human-readable description of what the edit does, e.g. "split Costco $200 into groceries + household"',
    ),
  proposed_text: z
    .string()
    .describe(
      'Beancount text that should replace the target transactions (or be appended, if no targets). Must include full transaction headers and balanced postings.',
    ),
  target_txn_ids: z
    .array(z.number().int())
    .optional()
    .describe(
      'IDs of existing transactions to be replaced by `proposed_text`. Omit or pass [] for pure additions (e.g. opening a new account, recording a fresh txn).',
    ),
})

export const proposeJournalEditResultSchema = z.object({
  ok: z.literal(true),
  proposal_id: z.string(),
  instruction: z.string(),
  before_text: z.string(),
  proposed_text: z.string(),
  summary: z.object({
    insert: z.number().int(),
    delete: z.number().int(),
    unchanged: z.number().int(),
  }),
})
export type ProposeJournalEditResult = z.infer<typeof proposeJournalEditResultSchema>

export const extractStatementRowsSchema = z.object({
  account_hint: z
    .string()
    .optional()
    .describe(
      'Full Beancount account the rows belong to, e.g. "Assets:Bank:Chase:Checking". Pick the most specific account from the existing chart; omit if genuinely unknown.',
    ),
  currency: z.string().describe('ISO 4217 code, e.g. "USD"'),
  source_filename: z
    .string()
    .optional()
    .describe('Original filename of the statement, for display in the preview card.'),
  statement_period: z
    .string()
    .optional()
    .describe('Free-form period string, e.g. "Mar 1 – Mar 31, 2026".'),
  rows: z
    .array(
      z.object({
        date: z.string().describe('YYYY-MM-DD posting date'),
        description: z
          .string()
          .describe('Raw payee/memo string from the statement, before any cleanup.'),
        amount: z
          .number()
          .describe(
            'Signed amount in the statement currency. Positive = money in (credit/deposit on a checking statement, payment on a credit-card statement). Negative = money out (debit/charge).',
          ),
        balance: z
          .number()
          .optional()
          .describe('Running balance after this row, if the statement provides one.'),
        type: z
          .string()
          .optional()
          .describe('Statement-provided category/type label, e.g. "ACH", "POS", "INT".'),
      }),
    )
    .min(1)
    .describe(
      'Normalized rows extracted from the statement. Keep one row per posting; do NOT collapse duplicates or aggregate by category. Preserve the statement order.',
    ),
})
export type ExtractStatementRowsProps = z.infer<typeof extractStatementRowsSchema>

export const commitIngestSchema = z.object({
  account: z
    .string()
    .describe(
      'Full Beancount account the statement belongs to, e.g. "Assets:Bank:Chase:Checking" or "Liabilities:CreditCard:HSBC:Cashback".',
    ),
  currency: z.string().describe('ISO 4217 code matching the statement, e.g. "USD"'),
  source_filename: z
    .string()
    .optional()
    .describe('Original statement filename, used in the proposal instruction.'),
  rows: z
    .array(
      z.object({
        date: z.string().describe('YYYY-MM-DD posting date'),
        amount: z
          .number()
          .describe(
            'Signed amount in `currency`, using the same sign convention as extract_statement_rows: positive = money into `account`, negative = money out.',
          ),
        payee: z
          .string()
          .describe('Cleaned-up payee/merchant string for the txn header, e.g. "Starbucks".'),
        narration: z
          .string()
          .optional()
          .describe(
            'Free-form narration in the txn header — usually the raw description if it adds detail beyond the payee, otherwise omit.',
          ),
        counterparty: z
          .string()
          .describe(
            'Other-side Beancount account, e.g. "Expenses:Food:Coffee", "Income:Salary", "Liabilities:CreditCard:Chase". Must exist in the chart of accounts. Categorize based on the description; ask the user if unsure for a row.',
          ),
        tags: z
          .array(z.string())
          .optional()
          .describe('Optional #tags to apply to the txn header.'),
      }),
    )
    .min(1)
    .describe(
      'Rows the user selected in the StatementRows card. Pick a `counterparty` for each based on its description and the existing chart of accounts.',
    ),
})

export const commitJournalEditSchema = z.object({
  proposal_id: z
    .string()
    .describe('ID returned by a prior propose_journal_edit call.'),
  edited_text: z
    .string()
    .optional()
    .describe(
      'Optional override of `proposed_text` — used when the user tweaked the DiffCard textarea before approving.',
    ),
})

export const GEN_UI_TOOLS = {
  show_vega: showVegaSchema,
  show_account_card: accountCardSchema,
  extract_statement_rows: extractStatementRowsSchema,
  propose_journal_edit: proposeJournalEditResultSchema,
} as const

export type GenUiToolName = keyof typeof GEN_UI_TOOLS

import { tool } from 'ai'
import { generateText, type LanguageModel } from 'ai'
import { z } from 'zod'
import { validateEntry, type ValidationError } from '@/lib/beancount/validate-entry'
import { buildAccountsBlock } from './think-agent-prompt'

type GenerateResult =
  | { ok: true; raw_text: string; attempts: number }
  | {
      ok: false
      errors: ValidationError[]
      raw_text: string
      attempts: number
      human_summary: string
    }

export type WriterDeps = {
  model: LanguageModel
  maxAttempts: number
  getAccounts: () => readonly string[]
}

export function buildGenerateEntryTool(deps: WriterDeps) {
  return tool({
    description:
      'Generate a validated beancount entry from a natural-language description. Call this BEFORE `propose` whenever you need to stage a create or update — it handles syntax, balance, payee/narration, and cashback rules end-to-end. Returns `{ok:true, raw_text}` on success; pass `raw_text` verbatim to propose. On failure returns `{ok:false, errors, human_summary, raw_text}` — surface `human_summary` to the user (do NOT call propose).',
    inputSchema: z.object({
      description: z
        .string()
        .min(1)
        .describe(
          "Natural-language description of the transaction to stage. Include date, payee, amount+currency, and the paying/source account. e.g. 'yesterday, ₹400 at Firefly Coffee Roasters, paid on HSBC cashback card'.",
        ),
      context: z
        .string()
        .optional()
        .describe(
          'Optional: referenced prior entries, formatting conventions, or clarifications. Quote relevant raw_text from recent ledger_search/ledger_get output so the writer can match structure (especially for cashback patterns and account-name casing).',
        ),
    }),
    execute: async ({ description, context }): Promise<GenerateResult> => {
      const system = buildWriterSystemPrompt(deps.getAccounts())
      const attempts: Array<{ raw_text: string; errors: ValidationError[] }> = []
      let lastRawText = ''
      for (let i = 0; i < deps.maxAttempts; i++) {
        const prompt = buildWriterUserPrompt({ description, context, prior: attempts })
        let text: string
        try {
          const res = await generateText({ model: deps.model, system, prompt })
          text = res.text
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          console.warn('[writer] generateText failed', msg)
          return {
            ok: false,
            errors: [{ source: 'provider', message: msg }],
            raw_text: lastRawText,
            attempts: i + 1,
            human_summary: `Writer model call failed (${msg}).`,
          }
        }
        lastRawText = stripFences(text).trim()
        const v = validateEntry(lastRawText)
        if (v.ok) return { ok: true, raw_text: lastRawText, attempts: i + 1 }
        attempts.push({ raw_text: lastRawText, errors: v.errors })
      }
      const last = attempts[attempts.length - 1]
      return {
        ok: false,
        errors: last.errors,
        raw_text: last.raw_text,
        attempts: attempts.length,
        human_summary: summarizeErrors(last.errors),
      }
    },
  })
}

function summarizeErrors(errors: readonly ValidationError[]): string {
  if (errors.length === 0) return 'Generation failed with unknown errors.'
  if (errors.length === 1) return errors[0].message
  return `${errors.length} issues: ${errors.map((e) => e.message).join('; ')}`
}

function buildWriterSystemPrompt(userAccounts: readonly string[]): string {
  const todayIso = new Date().toISOString().slice(0, 10)
  const yesterdayIso = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  return `You are a beancount entry writer. Given a natural-language description of a single transaction, output ONE valid beancount entry as raw text — nothing else.

Today is ${todayIso}. Resolve partial dates ("yesterday", "19 april") relative to today.

# Output format
Output ONLY the raw beancount entry. No markdown, no code fences, no preamble, no trailing commentary. Just the entry, exactly as it should appear in the ledger.

# Structure
\`YYYY-MM-DD * "payee" "narration"\` on the header line, then indented postings. Two-string header is REQUIRED — reuse the payee as narration if the user gave no separate narration.

Each posting: \`  Account:Name  <amount> <CURRENCY>\`. Amounts per currency must sum to 0.

${buildAccountsBlock(userAccounts)}

# Validators you MUST satisfy
- parse: syntactically valid beancount.
- balance: per-currency posting amounts sum to 0.
- expense sign: Expenses:... postings are POSITIVE.
- payee present: header has TWO strings (payee + narration).
- amount required: every posting has an amount and currency.
- cashback sign/counterpart: Income:Rewards:Cashback is NEGATIVE and paired with an equal-absolute POSITIVE leg on a card/bank/cash account.
- cashback needs payment: a cashback txn must include a card/bank/cash leg — not just expense + cashback.

# Common patterns
- Credit card purchase: Expenses:... (+amount) and Liabilities:CC:... (-amount).
- Cash/bank expense: Expenses:... (+amount) and Assets:... (-amount).
- Cashback on a card: four postings — expense (+), card (−billed amount), Income:Rewards:Cashback (−cashback amount), second card/bank leg (+same absolute as cashback).

# Amount fidelity
Use the EXACT number the user gave. Do not round, adjust, or "fix" amounts.

# Example
Input: "yesterday, ₹400 at Firefly Coffee Roasters, HSBC cashback card"
Output:
${yesterdayIso} * "Firefly Coffee Roasters" "Coffee"
  Expenses:Food:Coffee           400 INR
  Liabilities:CC:HSBC:Cashback  -400 INR
`
}

function buildWriterUserPrompt(args: {
  description: string
  context?: string
  prior: Array<{ raw_text: string; errors: ValidationError[] }>
}): string {
  const parts: string[] = [`Transaction: ${args.description}`]
  if (args.context) parts.push(`\nContext:\n${args.context}`)
  if (args.prior.length > 0) {
    const last = args.prior[args.prior.length - 1]
    parts.push(
      `\nPrior attempt failed validation. Fix and retry:\n${last.raw_text}\nErrors:\n${last.errors.map((e) => `- [${e.source}] ${e.message}`).join('\n')}`,
    )
  }
  parts.push('\nOutput the raw beancount entry now.')
  return parts.join('\n')
}

function stripFences(text: string): string {
  const match = /^```[a-zA-Z]*\n([\s\S]*?)\n```\s*$/.exec(text.trim())
  return match ? match[1] : text
}

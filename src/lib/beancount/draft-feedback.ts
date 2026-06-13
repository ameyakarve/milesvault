import { validateDraftBatch } from './validate-draft-batch'

// Builds the tool-feedback the editor model receives when a `draft_transaction`
// batch fails validation. Replaces the AI SDK's default
// "Type validation failed: Value: {entire batch}" echo (which dumps the whole
// beancount back and drowns the actionable part) with a compact, actionable
// message that:
//   1. lists ONLY the failing entries (never the whole batch),
//   2. attaches a worked example for each failure CLASS, and
//   3. flags any entry the model already submitted verbatim and got rejected —
//      so it stops re-emitting the identical broken line.
// The model still re-sends the full batch on its next call (the suspending card
// renders the whole thing); this only governs what we tell it went wrong.

// One worked example per failure class. The model picks the shape; we never
// rewrite its accounting (LLM-first) — we just show the canonical pattern.
const EX_CROSS_COMMODITY = `A transfer/conversion between two DIFFERENT commodities must carry the rate in @@,
so each commodity nets to zero (the @@ total is denominated in the OTHER commodity):
  2026-05-27 * "Transfer" "points moved between two programmes"
    Assets:Rewards:Miles:<Dest>   10000 DST_PTS @@ 10000 SRC_PTS
    Assets:Rewards:Miles:<Src>   -10000 SRC_PTS`

const EX_BALANCE_SINGLE = `For a SINGLE-commodity entry that doesn't sum to zero, decide which it is:
- EARN/accrual: add an Equity:Void contra so the points commodity nets to zero:
    Assets:Rewards:<Issuer>:Pending   200 PTS
    Equity:Void                      -200 PTS
- REDEMPTION: the points leg carries its CASH value via @@, and the CASH is the
  expense (in fiat) — do NOT put the points commodity on the expense leg:
    Expenses:Travel:Flights        50000 INR
    Assets:Rewards:Miles:<Prog>   -10000 PTS @@ 50000 INR`

const EX_PARSE = `An entry must be ONE valid beancount transaction: a date/flag/payee line, then
indented postings — no prose, parentheses, or commentary inside the string:
  2026-05-13 * "Cloudflare" "Subscription"
    Expenses:Personal:Software     2.36 USD @@ 225.98 INR
    Liabilities:CreditCards:Axis:Magnus  -225.98 INR`

const EX_DIRECTIVE = `Only transactions and balance/pad assertions belong in a draft — not open/close/
price/etc. To set a balance, emit pad + balance:
  2026-06-12 pad Assets:Rewards:Miles:<Prog>  Equity:Void
  2026-06-12 balance Assets:Rewards:Miles:<Prog>  10000 PTS`

const EX_ACCOUNT = `Use a canonical account path. Credit-card liabilities are exactly
Liabilities:CreditCards:<Issuer>:<Card> (fold tier/variant into <Card>); reward
accounts come from list_reward_accounts — copy them verbatim.`

// Distinct commodity tickers on the posting AMOUNTS of one entry. Two or more
// (with no @@/@ converting between them) is the cross-commodity signature.
// Only indented posting lines are scanned, and only the first amount+commodity
// per line — so a "<number> <UPPERCASE>" pattern in the narration (e.g. a flight
// number + airport code) and the @@-price commodity don't get miscounted.
function commodityCount(entry: string): number {
  const set = new Set<string>()
  for (const line of entry.split('\n')) {
    if (!/^\s/.test(line)) continue // skip the date/payee header; postings are indented
    const m = line.match(/-?[\d,]+\.?\d*\s+([A-Z][A-Z0-9'._-]*)/)
    if (m) set.add(m[1]!)
  }
  return set.size
}

function pickExample(message: string, entry: string): string {
  if (/parse error/i.test(message)) return EX_PARSE
  if (/contains a directive/i.test(message)) return EX_DIRECTIVE
  if (/exactly one transaction/i.test(message)) return EX_PARSE
  if (/does not balance|unbalanced/i.test(message)) {
    return commodityCount(entry) >= 2 && !/@@|@/.test(entry)
      ? EX_CROSS_COMMODITY
      : EX_BALANCE_SINGLE
  }
  return EX_ACCOUNT
}

// Per-entry feedback: the validator's per-entry message PLUS a worked example
// for that failure class. Surfaced through the schema's superRefine (the
// standard tool-input-validation path) so the model gets actionable, example-
// rich guidance on the failing entries — no separate feedback tool, no UI
// plumbing. The validator already names the entry by date/payee.
export function entryFeedback(entryText: string, message: string): string {
  return `${message}\n${indent(pickExample(message, entryText))}`
}

function indent(s: string): string {
  return s
    .split('\n')
    .map((l) => `    ${l}`)
    .join('\n')
}

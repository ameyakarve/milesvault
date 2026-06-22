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

// One worked beancount example per failure class. The model picks the shape; we
// never rewrite its accounting (LLM-first) — we just show the canonical pattern.
// These are shown to the model, so they are beancount text (the model emits
// beancount text, one entry per draft element).
const EX_CROSS_COMMODITY = `A conversion between two DIFFERENT commodities needs an @@ total price so each
commodity nets to zero — the price is the total in the OTHER commodity:
  2026-05-21 * "Transfer" "Points transfer"
    Assets:Rewards:<Dest>   10000 DST_PTS @@ 10000 SRC_PTS
    Assets:Rewards:<Src>   -10000 SRC_PTS`

// The entry HAS an @@ price but still doesn't net to zero. TWO possible causes —
// the wrong @@ amount, OR a spurious/missing leg (e.g. an EARN row wrongly carrying
// an expense or card leg). Do NOT assert "just fix the price, never touch a leg":
// that traps an over-legged earn that can never balance by tweaking the price.
const EX_PRICE_RATE = `This entry has an @@/@ price but a currency still doesn't net to zero. Two
possible causes — work out which, don't just retry the same numbers:
(a) The @@ price AMOUNT is wrong (e.g. 0). Set it so the priced leg's value exactly
    cancels the other leg — to cancel a -150 SRC_PTS leg the priced leg needs @@ 150 SRC_PTS:
      2026-05-21 * "Transfer" "Points transfer"
        Assets:Rewards:<Dest>   10000 DST_PTS @@ 150 SRC_PTS
        Assets:Rewards:<Src>     -150 SRC_PTS
(b) There is a SPURIOUS or MISSING leg. A points EARN (the points line is POSITIVE,
    +N) is a plain accrual — points + an Equity:Void contra, and NOTHING else: NO
    Expenses leg, NO Liabilities:CreditCards leg, NO @@ price. If you gave an earn an
    expense, a card leg, or a price, REMOVE them:
      2026-08-06 * "Airline" "Flight — miles earned"
        Assets:Rewards:<Prog>        557 PTS
        Equity:Void                  -557 PTS
    A redemption (points NEGATIVE) carries its cash value via @@ with the cash as the
    expense — and NO separate card leg.`

const EX_BALANCE_SINGLE = `For a SINGLE-commodity entry that doesn't net to zero, decide which it is:
- EARN/accrual: add an Equity:Void contra so the points commodity nets to zero:
    2026-05-21 * "Merchant" "Purchase — points earned"
      Assets:Rewards:<Prog>:Pending   200 PTS
      Equity:Void                    -200 PTS
- REDEMPTION: the points leg carries its CASH value via an @@ price, and the CASH
  is the expense (in fiat) — NEVER the points commodity on the expense leg:
    2026-05-21 * "Airline" "Award flight"
      Expenses:Travel:Flights        50000 INR
      Assets:Rewards:<Prog>   -10000 PTS @@ 50000 INR`

const EX_PARSE = `Each entry's text must be ONE valid beancount entry: a date header
\`YYYY-MM-DD * "Payee" "Narration"\` then 2+ indented posting lines
\`Account  amount CURRENCY\`. Every leg needs an explicit amount AND currency (no
blanks), and each account starts with a capital under Assets/Liabilities/Equity/
Income/Expenses with NO spaces. No prose or commentary inside any field.`

const EX_DIRECTIVE = `Only a transaction, a \`balance\` line, or a \`pad\`+\`balance\` pair belong in a draft.
To set a balance, emit a pad+balance pair (plug Equity:Void):
  2026-06-12 pad Assets:Rewards:<Prog> Equity:Void
  2026-06-12 balance Assets:Rewards:<Prog>  10000 PTS`

const EX_ACCOUNT = `Use a canonical account path. Credit-card liabilities are exactly
Liabilities:CreditCards:<Issuer>:<Card> (fold tier/variant into <Card>); reward
accounts come from list_reward_accounts — copy them verbatim.`

// An expense leg carried a non-fiat (points/reward) commodity. Expenses are
// fiat only; reward commodities live on Assets:Rewards legs.
const EX_FIAT_EXPENSE = `An expense leg is ALWAYS fiat (a 3-letter code like INR/USD) — a points/reward
commodity (RWD_PTS, MILES, …) only ever sits on an Assets:Rewards leg.
A points EARN/credit has NO expense leg at all (just the accrual + Equity:Void).
A REDEMPTION puts the CASH value (fiat) on the expense and the points on the
Assets:Rewards leg:
  2026-05-21 * "Airline" "Award flight"
    Expenses:Travel:Flights        50000 INR
    Assets:Rewards:<Prog>   -10000 PTS @@ 50000 INR`

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
  if (/credit card accounts must be/i.test(message)) return EX_ACCOUNT
  if (/expense leg must be a fiat/i.test(message)) return EX_FIAT_EXPENSE
  if (/only kind|allowed in a draft/i.test(message)) return EX_DIRECTIVE
  if (
    /could not parse|silently dropped|elided or blank|explicit numeric amount|exactly one transaction/i.test(
      message,
    )
  )
    return EX_PARSE
  if (/does not balance|net = /i.test(message)) {
    const priced = /@@|@/.test(entry)
    const multi = commodityCount(entry) >= 2
    if (priced) return EX_PRICE_RATE // has a price but it's wrong → fix the @@ amount
    if (multi) return EX_CROSS_COMMODITY // two commodities, no price → add the @@
    return EX_BALANCE_SINGLE // single commodity → contra (earn) or @@ cash (redemption)
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

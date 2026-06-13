import { validateDraftBatch } from '../../src/lib/beancount/validate-draft-batch'

// Owner ruling: code is NOT an arbiter — the model emits complete beancount
// text and the GENERIC validator (parse + per-currency balance + account shape
// + no silently-dropped postings + no elided amounts) is the only guardrail.
// There is no IR and nothing is serialized or rewritten. So this test feeds a
// complete, model-authored beancount batch and checks two things:
//   1. the validator ACCEPTS a balanced, well-formed batch unchanged;
//   2. the validator REJECTS a broken (unbalanced) entry — the bounce.
//
// All data here is SYNTHETIC — fictional issuer/merchants/amounts. Never put
// real statement data in tests.

const CARD = 'Liabilities:CreditCards:Demo:Sample:0000'

// A complete batch exactly as the model authors it: one entry per element,
// balanced, real accounts/ticker, points legs, the landing, and pad+balance
// closings (the plug Equity:Void written by the MODEL, not injected by code).
const entries: string[] = [
  // Opening balance — a bare assertion (no pad).
  `2026-04-01 balance ${CARD}  1000.00 INR`,
  // A spend with its own points accrual legs.
  `2026-04-05 * "SAMPLE STORE" "Shopping"
  Expenses:Shopping:General  2000.00 INR
  ${CARD}  -2000.00 INR
  Assets:Rewards:Demo:Pending  120 DEMO-PTS
  Equity:Void  -120 DEMO-PTS`,
  // A forex spend, balanced with @@ plus the fee/GST legs.
  `2026-04-10 * "EXAMPLE SAAS CO" "Software (USD 10.00 + markup + GST)"
  Expenses:Software:SaaS  10.00 USD @@ 850.00 INR
  Expenses:Financial:ForexMarkup  19.00 INR
  Expenses:Financial:GST  3.42 INR
  ${CARD}  -872.42 INR
  Assets:Rewards:Demo:Pending  48 DEMO-PTS
  Equity:Void  -48 DEMO-PTS`,
  // A payment (clearing leg negative, no points).
  `2026-04-15 * "PAYMENT RECEIVED" "Auto-debit"
  Assets:Clearing:CardPayments  -5000.00 INR
  ${CARD}  5000.00 INR`,
  // The landing: earned points credited at close (Pending → posted, no Void).
  `2026-04-30 * "Statement close" "Reward points credited"
  Assets:Rewards:Demo  168 DEMO-PTS
  Assets:Rewards:Demo:Pending  -168 DEMO-PTS`,
  // Closing balances (card + points), each a pad+balance pair.
  `2026-04-30 pad ${CARD} Equity:Void
2026-04-30 balance ${CARD}  -2127.58 INR`,
  `2026-04-30 pad Assets:Rewards:Demo Equity:Void
2026-04-30 balance Assets:Rewards:Demo  168 DEMO-PTS`,
]

const v = validateDraftBatch(entries)
const joined = entries.join('\n\n')
console.log(joined)

const checks: Array<[string, boolean]> = [
  ['generic validator accepts the balanced batch', v.ok === true],
]

// The validator must REJECT a broken (unbalanced) entry — that's the only
// guardrail now, and it must bounce.
const broken = `2026-04-05 * "UNBALANCED" ""
  Expenses:Misc  100.00 INR
  ${CARD}  -90.00 INR`
checks.push(['generic validator rejects an unbalanced entry', validateDraftBatch([broken]).ok === false])

// And it must reject an entry with a silently-droppable (lowercase) account
// rather than letting the posting vanish.
const dropped = `2026-04-06 * "DROPPED LEG" ""
  expenses:misc  100.00 INR
  ${CARD}  -100.00 INR`
checks.push(['generic validator rejects a silently-dropped posting', validateDraftBatch([dropped]).ok === false])

let fail = 0
for (const [name, ok] of checks) {
  console.log(ok ? 'PASS' : 'FAIL', name)
  if (!ok) fail++
}
if (v.ok === false) console.log(JSON.stringify(v.issues, null, 1))
process.exit(fail ? 1 : 0)

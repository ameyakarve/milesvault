import {
  toLedgerEntries,
  serializeEntries,
  type ExtractedStatement,
} from '../../src/durable/ingest/pipeline'
import { validateDraftBatch } from '../../src/lib/beancount/validate-draft-batch'

// Owner ruling: code is NOT an arbiter — the model emits complete beancount in
// the IR; toLedgerEntries only splits it for the serializer, and the GENERIC
// validator (parse + per-currency balance + account shape) bounces repairs.
// So this test feeds a complete, model-authored IR and checks two things:
//   1. it passes through unchanged and serializes to the expected beancount;
//   2. the generic validator accepts a balanced batch and rejects a broken one.
//
// All data here is SYNTHETIC — fictional issuer/merchants/amounts. Never put
// real statement data in tests.

const CARD = 'Liabilities:CreditCards:Demo:Sample:0000'
const POOL = 'Assets:Rewards:Demo'
const TICKER = 'DEMO-PTS'

// A complete batch exactly as the model authors it (balanced, real accounts,
// real ticker, points legs, the landing, pad+balance bookends).
const extracted: ExtractedStatement = {
  card_name: 'Demo Sample Card',
  entries: [
    {
      kind: 'balance', // bare assertion — no pad
      date: '2026-04-01',
      account: CARD,
      amount: '1000.00',
      currency: 'INR',
    },
    // A spend with its own points legs (model-authored).
    {
      kind: 'transaction',
      txn: {
        date: '2026-04-05',
        flag: '*',
        payee: 'SAMPLE STORE',
        narration: 'Shopping',
        tags: [],
        postings: [
          { account: 'Expenses:Shopping:General', amount: '2000.00', currency: 'INR' },
          { account: CARD, amount: '-2000.00', currency: 'INR' },
          { account: `${POOL}:Pending`, amount: '120', currency: TICKER },
          { account: 'Equity:Void', amount: '-120', currency: TICKER },
        ],
      },
    },
    // A forex spend, model-balanced with @@ and the fee/GST legs.
    {
      kind: 'transaction',
      txn: {
        date: '2026-04-10',
        flag: '*',
        payee: 'EXAMPLE SAAS CO',
        narration: 'Software (USD 10.00 + ₹19.00 markup + ₹3.42 GST)',
        tags: [],
        postings: [
          {
            account: 'Expenses:Software:SaaS',
            amount: '10.00',
            currency: 'USD',
            price_at_signs: 2,
            price_amount: '850.00',
            price_currency: 'INR',
          },
          { account: 'Expenses:Financial:ForexMarkup', amount: '19.00', currency: 'INR' },
          { account: 'Expenses:Financial:GST', amount: '3.42', currency: 'INR' },
          { account: CARD, amount: '-872.42', currency: 'INR' },
          { account: `${POOL}:Pending`, amount: '48', currency: TICKER },
          { account: 'Equity:Void', amount: '-48', currency: TICKER },
        ],
      },
    },
    // A payment (clearing leg negative, no points), model-authored.
    {
      kind: 'transaction',
      txn: {
        date: '2026-04-15',
        flag: '*',
        payee: 'PAYMENT RECEIVED',
        narration: 'Auto-debit',
        tags: [],
        postings: [
          { account: 'Assets:Clearing:CardPayments', amount: '-5000.00', currency: 'INR' },
          { account: CARD, amount: '5000.00', currency: 'INR' },
        ],
      },
    },
    // The landing: earned points credited at close (Pending → posted, no Void).
    {
      kind: 'transaction',
      txn: {
        date: '2026-04-30',
        flag: '*',
        payee: 'Statement close',
        narration: 'Reward points credited',
        tags: [],
        postings: [
          { account: POOL, amount: '168', currency: TICKER },
          { account: `${POOL}:Pending`, amount: '-168', currency: TICKER },
        ],
      },
    },
    // Closing balances (card + points), model-authored with their pads.
    {
      kind: 'pad',
      date: '2026-04-30',
      account: CARD,
      amount: '-2127.58',
      currency: 'INR',
      plug_account: 'Equity:Void',
    },
    {
      kind: 'pad',
      date: '2026-04-30',
      account: POOL,
      amount: '168',
      currency: TICKER,
      plug_account: 'Equity:Void',
    },
  ],
}

const parts = toLedgerEntries(extracted.entries)
const entries = serializeEntries(parts)
const joined = entries.join('\n\n')
console.log(joined)
const v = validateDraftBatch(entries)

const checks: Array<[string, boolean]> = [
  // Pass-through: nothing rewritten, amounts/accounts/tickers verbatim.
  ['card amount verbatim (not recomputed)', joined.includes('-2000.00 INR')],
  ['forex @@ preserved', joined.includes('10.00 USD @@ 850.00 INR')],
  ['points legs verbatim', /Assets:Rewards:Demo:Pending\s+120 DEMO-PTS/.test(joined)],
  ['landing present (pending → posted)', /Assets:Rewards:Demo\s+168 DEMO-PTS/.test(joined) && /Assets:Rewards:Demo:Pending\s+-168 DEMO-PTS/.test(joined)],
  ['payment clearing negative', /Assets:Clearing:CardPayments\s+-5000\.00 INR/.test(joined)],
  ['points balance verbatim', joined.includes('balance Assets:Rewards:Demo') && joined.includes('168 DEMO-PTS')],
  ['pad kind renders pad+balance', joined.includes('pad Liabilities:CreditCards:Demo:Sample:0000 Equity:Void')],
  ['bare balance kind has NO pad (one card pad = the closing only)', (joined.match(/pad Liabilities:CreditCards:Demo:Sample:0000 Equity:Void/g) || []).length === 1],
  ['bare opening balance renders plain', /2026-04-01 balance Liabilities:CreditCards:Demo:Sample:0000\s+1000\.00 INR/.test(joined)],
  ['generic validator accepts the balanced batch', v.ok === true],
]

// The validator must REJECT a broken (unbalanced) entry — that's the only
// guardrail now, and it must bounce.
const broken = serializeEntries(
  toLedgerEntries([
    {
      id: 'x1',
      kind: 'transaction',
      txn: {
        date: '2026-04-05',
        flag: '*',
        payee: 'UNBALANCED',
        narration: '',
        tags: [],
        postings: [
          { account: 'Expenses:Misc', amount: '100.00', currency: 'INR' },
          { account: CARD, amount: '-90.00', currency: 'INR' },
        ],
      },
    },
  ]),
)
checks.push(['generic validator rejects an unbalanced entry', validateDraftBatch(broken).ok === false])

let fail = 0
for (const [name, ok] of checks) {
  console.log(ok ? 'PASS' : 'FAIL', name)
  if (!ok) fail++
}
if (v.ok === false) console.log(JSON.stringify(v.issues, null, 1))
process.exit(fail ? 1 : 0)

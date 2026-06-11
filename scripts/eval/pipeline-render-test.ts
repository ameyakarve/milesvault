import {
  toLedgerEntries,
  serializeEntries,
  parseBaseRate,
  type ExtractedStatement,
} from '../../src/durable/ingest/pipeline'
import type { CardGuideResult } from '../../src/durable/agents/tools/editor/card-guide'
import { validateDraftBatch } from '../../src/lib/beancount/validate-draft-batch'

const guide: CardGuideResult = {
  ok: true,
  card: { slug: 'cc/axis-magnus-burgundy', name: 'Axis Magnus Burgundy' },
  pool: {
    currency: 'currency/edge-rewards-burgundy',
    name: 'EDGE Rewards — Burgundy tier',
    ticker: 'AXIS-EDGE-BURGUNDY',
    account: 'Assets:Rewards:Axis',
    rate_notes: 'Base earn: 12 EDGE RPs / ₹200 spent (block-based).',
  },
  overrides: [],
  logging_guide: 'Base 12 EDGE RPs / ₹200, block-based.',
  card_notes: null,
}

const CARD = 'Liabilities:CreditCards:Axis:MagnusBurgundy:3467'

// What the model would emit (loose) — parsed through the real schema would
// transform it; here we hand-build the post-transform shape the pipeline
// type expects, exercising toLedgerEntries + serializeEntries + validation.
const extracted: ExtractedStatement = {
  card_name: 'Axis Bank Magnus Burgundy',
  entries: [
    {
      kind: 'balance',
      date: '2026-04-20',
      account: CARD,
      amount: '96913.01',
      currency: 'INR',
      plug_account: 'Equity:Opening-Balances',
    },
    {
      kind: 'transaction',
      txn: {
        date: '2026-04-20',
        flag: '*',
        payee: 'ASH CRADLE,BANGALORE',
        narration: 'Medical',
        tags: [],
        postings: [
          { account: 'Expenses:Medical:Hospital', amount: '800.00', currency: 'INR' },
          { account: 'Assets:Rewards:Axis:Pending', amount: '48', currency: 'AXIS-EDGE-BURGUNDY' },
          { account: 'Equity:Void', amount: '-48', currency: 'AXIS-EDGE-BURGUNDY' },
          // deliberately WRONG model figure — code must overrule it
          { account: CARD, amount: '-999.99', currency: 'INR' },
        ],
      },
    },
    {
      kind: 'transaction',
      txn: {
        date: '2026-04-24',
        flag: '*',
        payee: 'IOCL FUEL',
        narration: 'Fuel',
        tags: ['earn-excluded'],
        postings: [
          { account: 'Expenses:Transport:Fuel', amount: '3000.00', currency: 'INR' },
          { account: CARD, amount: null, currency: null },
        ],
      },
    },
    {
      kind: 'transaction',
      txn: {
        date: '2026-05-14',
        flag: '*',
        payee: 'AMAZON PAY INDIA PRIVA',
        narration: 'Refund',
        tags: [],
        postings: [
          { account: 'Expenses:Shopping:Misc', amount: '-877.82', currency: 'INR' },
          { account: 'Assets:Rewards:Axis:Pending', amount: '-48', currency: 'AXIS-EDGE-BURGUNDY' },
          { account: 'Equity:Void', amount: '48', currency: 'AXIS-EDGE-BURGUNDY' },
          { account: CARD, amount: null, currency: null },
        ],
      },
    },
    {
      kind: 'transaction',
      txn: {
        date: '2026-04-26',
        flag: '*',
        payee: 'CLOUDFLARE,SAN FRANCISCO',
        narration: 'Software',
        tags: [],
        postings: [
          {
            account: 'Expenses:Software:Subscriptions',
            amount: '9.28',
            currency: 'USD',
            price_at_signs: 2,
            price_amount: '875.30',
            price_currency: 'INR',
          },
          { account: 'Assets:Rewards:Axis:Pending', amount: '48', currency: 'AXIS-EDGE-BURGUNDY' },
          { account: 'Equity:Void', amount: '-48', currency: 'AXIS-EDGE-BURGUNDY' },
          { account: CARD, amount: null, currency: null },
        ],
      },
    },
    {
      kind: 'transaction',
      txn: {
        date: '2026-05-02',
        flag: '*',
        payee: 'PAYMENT RECEIVED',
        narration: 'Auto-debit',
        tags: [],
        postings: [
          { account: 'Assets:Clearing:CardPayments', amount: '-25000.00', currency: 'INR' },
          { account: CARD, amount: null, currency: null },
        ],
      },
    },
    {
      kind: 'balance',
      date: '2026-05-19',
      account: CARD,
      amount: '16754.09',
      currency: 'INR',
      plug_account: 'Equity:Opening-Balances',
    },
    {
      kind: 'balance',
      date: '2026-05-19',
      account: 'PLACEHOLDER',
      amount: '1296',
      currency: 'POINTS',
      plug_account: 'Equity:Opening-Balances',
    },
  ],
}

const rate = parseBaseRate(guide)
const parts = toLedgerEntries({
  extracted,
  rate,
  pool: guide.ok ? guide.pool : null,
  accounts: [CARD, 'Expenses:Medical:Hospital'],
  cardName: 'Axis Magnus Burgundy',
})
const entries = serializeEntries(parts)
console.log(entries.join('\n\n'))
const v = validateDraftBatch(entries)
const joined = entries.join('\n\n')

const checks: Array<[string, boolean]> = [
  ['rate 12/200', rate?.pts === 12 && rate?.per === 200],
  ['opening Cr positive', joined.includes('96913.01 INR')],
  ['closing Cr positive', joined.includes('16754.09 INR')],
  ['pads plug Adjustments', joined.includes('pad Liabilities:CreditCards:Axis:MagnusBurgundy:3467 Equity:Adjustments')],
  ['payment: card +25000, no points', /PAYMENT RECEIVED[\s\S]*?MagnusBurgundy:3467\s+25000\.00 INR/.test(joined) && !/PAYMENT RECEIVED[\s\S]*?AXIS-EDGE/.test(entries.find((e) => e.includes('PAYMENT')) ?? '')],
  ['ash cradle 48 pts', /ASH CRADLE[\s\S]*?Assets:Rewards:Axis:Pending\s+48 AXIS-EDGE-BURGUNDY/.test(joined)],
  ['no decorative tags', !joined.includes('#reward-accrual') && !joined.includes('#earn-excluded')],
  ['card leg code-computed (-999.99 overruled)', /ASH CRADLE[\s\S]*?MagnusBurgundy:3467\s+-800\.00 INR/.test(joined) && !joined.includes('-999.99')],
  ['fuel no points', !/IOCL[\s\S]*?AXIS-EDGE/.test(entries.find((e) => e.includes('IOCL')) ?? '')],
  ['refund -48 pts', /AMAZON[\s\S]*?Pending\s+-48 AXIS-EDGE-BURGUNDY/.test(joined)],
  ['forex @@ preserved + 52 pts', /9\.28 USD @@ 875\.30 INR/.test(joined) && /CLOUDFLARE[\s\S]*?Pending\s+48 AXIS-EDGE-BURGUNDY/.test(joined)],
  ['points wallet 1296', joined.includes('balance Assets:Rewards:Axis') && joined.includes('1296 AXIS-EDGE-BURGUNDY')],
  ['validates', v.ok],
]
// A mashed model account must resolve to the EXISTING ledger account
import { resolveCardAccount } from '../../src/durable/ingest/pipeline'
checks.push([
  'mashed card account resolved',
  resolveCardAccount({
    modelAccount: 'Liabilities:CreditCards:AxisBankMagnusBurgundy',
    accounts: [CARD],
    issuer: 'Axis',
    cardName: 'Axis Magnus Burgundy',
  }) === CARD,
])
checks.push([
  'no existing → canonical from guide',
  resolveCardAccount({
    modelAccount: 'Liabilities:CreditCards:AxisBankMagnusBurgundy',
    accounts: [],
    issuer: 'Axis',
    cardName: 'Axis Bank Magnus Burgundy',
  }) === 'Liabilities:CreditCards:Axis:MagnusBurgundy',
])
// Rate-check guards the model's own points: a clean batch passes, a wrong
// figure bounces a precise repair message.
import { checkPointsArithmetic } from '../../src/durable/ingest/pipeline'
const pool = guide.ok ? guide.pool : null
checks.push(['rate-check: clean batch → no issues', checkPointsArithmetic(extracted, rate, pool).length === 0])
const wrong = structuredClone(extracted)
const ash = wrong.entries.find((e) => e.kind === 'transaction' && e.txn.payee === 'ASH CRADLE,BANGALORE')
if (ash && ash.kind === 'transaction') {
  const pend = ash.txn.postings.find((p) => p.account === 'Assets:Rewards:Axis:Pending')
  if (pend) pend.amount = '24' // should be 48
}
const wrongIssues = checkPointsArithmetic(wrong, rate, pool)
checks.push(['rate-check: wrong 24 → flags should-be-48', wrongIssues.some((m) => m.includes('should be 48'))])

let fail = 0
for (const [name, ok] of checks) {
  console.log(ok ? 'PASS' : 'FAIL', name)
  if (!ok) fail++
}
if (v.ok === false) console.log(JSON.stringify(v.issues, null, 1))
process.exit(fail ? 1 : 0)

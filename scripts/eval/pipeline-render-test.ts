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
const parts = toLedgerEntries({ extracted, rate, pool: guide.ok ? guide.pool : null })
const entries = serializeEntries(parts)
console.log(entries.join('\n\n'))
const v = validateDraftBatch(entries)
const joined = entries.join('\n\n')

const checks: Array<[string, boolean]> = [
  ['rate 12/200', rate?.pts === 12 && rate?.per === 200],
  ['opening Cr positive', joined.includes('96913.01 INR')],
  ['closing Cr positive', joined.includes('16754.09 INR')],
  ['pads folded in', joined.includes('pad Liabilities:CreditCards:Axis:MagnusBurgundy:3467 Equity:Opening-Balances')],
  ['ash cradle 48 pts', /ASH CRADLE[\s\S]*?Assets:Rewards:Axis:Pending\s+48 AXIS-EDGE-BURGUNDY/.test(joined)],
  ['card leg code-computed (-999.99 overruled)', /ASH CRADLE[\s\S]*?MagnusBurgundy:3467\s+-800\.00 INR/.test(joined) && !joined.includes('-999.99')],
  ['fuel no points', !/IOCL[\s\S]*?AXIS-EDGE/.test(entries.find((e) => e.includes('IOCL')) ?? '')],
  ['refund -48 pts', /AMAZON[\s\S]*?Pending\s+-48 AXIS-EDGE-BURGUNDY/.test(joined)],
  ['forex @@ preserved + 52 pts', /9\.28 USD @@ 875\.30 INR/.test(joined) && /CLOUDFLARE[\s\S]*?Pending\s+48 AXIS-EDGE-BURGUNDY/.test(joined)],
  ['points wallet 1296', joined.includes('balance Assets:Rewards:Axis') && joined.includes('1296 AXIS-EDGE-BURGUNDY')],
  ['validates', v.ok],
]
let fail = 0
for (const [name, ok] of checks) {
  console.log(ok ? 'PASS' : 'FAIL', name)
  if (!ok) fail++
}
if (v.ok === false) console.log(JSON.stringify(v.issues, null, 1))
process.exit(fail ? 1 : 0)

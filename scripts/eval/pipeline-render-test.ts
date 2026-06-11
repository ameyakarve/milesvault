import { renderEntries, parseBaseRate, type Extracted, type Classified } from '../../src/durable/ingest/pipeline'
import { validateDraftBatch } from '../../src/lib/beancount/validate-draft-batch'

const extracted: Extracted = {
  card_name: 'Axis Bank Magnus Burgundy',
  period: { from: '2026-04-20', to: '2026-05-18' },
  balances: [
    { amount: 96913.01, cr: true, as_of: '2026-04-19' },
    { amount: 16754.09, cr: true, as_of: '2026-05-18' },
    { amount: 1296, points: true, as_of: '2026-05-18' },
  ],
  transactions: [
    { date: '2026-04-20', merchant: 'ASH CRADLE,BANGALORE', credit: false, amount: 800, note: 'Medical' },
    { date: '2026-04-24', merchant: 'IOCL FUEL', credit: false, amount: 3000, note: 'Fuel' },
    { date: '2026-05-14', merchant: 'AMAZON PAY INDIA PRIVA', credit: true, amount: 877.82, note: 'Misc Store' },
    { date: '2026-05-01', merchant: 'CLOUDFLARE,SAN FRANCISCO', credit: false, amount: 895.96, note: 'Software' },
  ],
}
const classified: Classified = {
  card_account: 'Liabilities:CreditCards:Axis:MagnusBurgundy:3467',
  merchants: [
    { merchant: 'ASH CRADLE,BANGALORE', account: 'Expenses:Medical:Hospital', excluded: false },
    { merchant: 'IOCL FUEL', account: 'Expenses:Transport:Fuel', excluded: true },
    { merchant: 'AMAZON PAY INDIA PRIVA', account: 'Expenses:Shopping:Misc', excluded: false },
    { merchant: 'CLOUDFLARE,SAN FRANCISCO', account: 'Expenses:Software:Subscriptions', excluded: false },
  ],
}
const guideish = {
  ok: true as const,
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
const rate = parseBaseRate(guideish)
console.log('rate:', rate)
const entries = renderEntries({ extracted, classified, rate, pool: guideish.pool })
console.log('--- entries ---')
for (const e of entries) console.log(e + '\n')
const v = validateDraftBatch(entries)
console.log('validate:', JSON.stringify(v))
// Assertions
const joined = entries.join('\n\n')
const checks: Array<[string, boolean]> = [
  ['rate parsed 12/200', rate?.pts === 12 && rate?.per === 200],
  ['opening +96913.01', joined.includes('balance Liabilities:CreditCards:Axis:MagnusBurgundy:3467  96913.01 INR')],
  ['closing +16754.09', joined.includes('16754.09 INR')],
  ['ash cradle 48 pts', joined.includes('Assets:Rewards:Axis:Pending  48 AXIS-EDGE-BURGUNDY')],
  ['fuel no points', !/IOCL[\s\S]*?AXIS-EDGE/.test(joined.split('\n\n').find((e) => e.includes('IOCL')) ?? '')],
  ['refund -48 pts', joined.includes('Assets:Rewards:Axis:Pending  -48 AXIS-EDGE-BURGUNDY')],
  ['validates', v.ok],
  ['points bookend', joined.includes('balance Assets:Rewards:Axis  1296 AXIS-EDGE-BURGUNDY')],
]
// No-balances statement must render without bookends
const bare = renderEntries({
  extracted: { ...extracted, balances: [] },
  classified, rate, pool: guideish.pool,
})
checks.push(['no bookends when absent', !bare.join('').includes(' pad ') && validateDraftBatch(bare).ok])
let fail = 0
for (const [name, ok] of checks) {
  console.log(ok ? 'PASS' : 'FAIL', name)
  if (!ok) fail++
}
process.exit(fail ? 1 : 0)

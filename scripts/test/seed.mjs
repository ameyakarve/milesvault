// Seed the staging TEST user with a known fixture world.
//   TEST_USER_TOKEN=... node scripts/test/seed.mjs [--with-statement]
// Idempotent: resets first, then writes the fixture journal; optionally
// uploads a fixture statement so the background pipeline runs for real.
const BASE = process.env.MV_BASE ?? 'https://staging.milesvault.com'
const TOKEN = process.env.TEST_USER_TOKEN
if (!TOKEN) {
  console.error('TEST_USER_TOKEN required')
  process.exit(1)
}
const COOKIE = `mv-test-token=${encodeURIComponent(TOKEN)}`

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { cookie: COOKIE, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 200)}`)
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const FIXTURE_JOURNAL = `2026-01-01 open Liabilities:CreditCards:Axis:MagnusBurgundy:3467
2026-01-01 open Liabilities:CreditCards:HDFC:Infinia:1784

2026-06-01 * "Opening" "Card balances at tracking start"
  Liabilities:CreditCards:Axis:MagnusBurgundy:3467   0.00 INR
  Equity:Opening-Balances                            0.00 INR
`

const FIXTURE_STATEMENT = `AXIS BANK MAGNUS BURGUNDY CREDIT CARD STATEMENT
Statement Period 20/04/2026 - 18/05/2026  Payment Due Date 07/06/2026
Card Number 529629******3467
Previous Balance 1,000.00 Cr   Total Payment Due 2,330.00
Date        Merchant                          Amount
22/04/2026  ASH CRADLE,BANGALORE              800.00
24/04/2026  IOCL FUEL,BANGALORE               1,200.00
02/05/2026  FIREFLY COFFEE ROASTE,BANGALORE   460.00
05/05/2026  AMAZON PAY INDIA PRIVA            870.00
10/05/2026  PAYMENT RECEIVED                  1,000.00 Cr
12/05/2026  AMAZON PAY INDIA PRIVA            870.00 Cr (refund)
Reward Points: Opening 0  Earned 60  Closing 60
`

const withStatement = process.argv.includes('--with-statement')

console.log('reset…')
await call('POST', '/api/test/reset')
console.log('journal…')
const r = await call('PUT', '/api/ledger/journal/batch', {
  knownIds: [],
  buffer: FIXTURE_JOURNAL,
})
console.log('journal rows:', r.rows?.length ?? r)
if (withStatement) {
  console.log('statement…')
  const s = await call('POST', '/api/statements', {
    filename: 'fixture-axis-magnus.pdf',
    text: FIXTURE_STATEMENT,
    mode: 'inbox',
  })
  console.log('statement id:', s.id)
}
console.log('seeded.')

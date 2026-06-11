// Seed the staging TEST user with a known fixture world.
//   TEST_USER_TOKEN=... node scripts/test/seed.mjs [--with-statement]
// Idempotent: resets first, then writes the fixture journal; optionally
// uploads a fixture statement so the background pipeline runs for real.
import { readFileSync } from 'node:fs'
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

const FIXTURE_JOURNAL = `2026-01-01 open Liabilities:CreditCards:Axis:Ace:0000 INR

2026-06-01 * "Opening" "Card balance at tracking start"
  Liabilities:CreditCards:Axis:Ace:0000   0.00 INR
  Equity:Opening-Balances                 0.00 INR
`

const FIXTURE_STATEMENT = `AXIS BANK ACE CREDIT CARD STATEMENT
Statement Period 01/04/2026 - 30/04/2026  Payment Due Date 18/05/2026
Card Number 400000******0000
Previous Balance 0.00   Total Payment Due 3,000.00
Date        Merchant            Amount
05/04/2026  SAMPLE STORE        1,000.00
08/04/2026  DEMO FUEL STATION   2,000.00
15/04/2026  EXAMPLE CAFE        500.00
20/04/2026  PAYMENT RECEIVED    500.00 Cr
Reward Points: Opening 0  Earned 30  Closing 30
`

const withStatement = process.argv.includes('--with-statement')
// --journal <path> (or MV_SEED_JOURNAL): seed a real journal file instead of
// the synthetic fixture. Owner journals stay OUT of the repo — pass a path.
const jIdx = process.argv.indexOf('--journal')
const journalPath = jIdx > -1 ? process.argv[jIdx + 1] : process.env.MV_SEED_JOURNAL
const journal = journalPath ? readFileSync(journalPath, 'utf8') : FIXTURE_JOURNAL

console.log('reset…')
await call('POST', '/api/test/reset')
console.log('journal…')
const r = await call('PUT', '/api/ledger/journal/batch', {
  knownIds: [],
  buffer: journal,
})
console.log('journal rows:', r.rows?.length ?? r)
if (withStatement) {
  console.log('statement…')
  const s = await call('POST', '/api/statements', {
    filename: 'fixture-statement.pdf',
    text: FIXTURE_STATEMENT,
    mode: 'inbox',
  })
  console.log('statement id:', s.id)
}
console.log('seeded.')

// E2E smoke against staging AS the test user (cookie auth).
//   TEST_USER_TOKEN=... node scripts/test/e2e-smoke.mjs
// Seeds (with a statement), waits for the background pipeline, asserts the
// drafts carry points legs and bookends, screenshots the vault + inbox.
import { chromium } from '@playwright/test'
import { execSync } from 'node:child_process'

const BASE = process.env.MV_BASE ?? 'https://staging.milesvault.com'
const TOKEN = process.env.TEST_USER_TOKEN
if (!TOKEN) {
  console.error('TEST_USER_TOKEN required')
  process.exit(1)
}

execSync(`node scripts/test/seed.mjs --with-statement`, {
  stdio: 'inherit',
  env: { ...process.env, MV_BASE: BASE },
})

const COOKIE = `mv-test-token=${encodeURIComponent(TOKEN)}`
const api = async (path) => {
  const r = await fetch(`${BASE}${path}`, { headers: { cookie: COOKIE } })
  if (!r.ok) throw new Error(`${path}: ${r.status}`)
  return r.json()
}

// 1. Wait for the pipeline: captured/processing → extracted (max ~3 min).
let capture = null
for (let i = 0; i < 36; i++) {
  const { rows } = await api('/api/ledger/captures')
  capture = rows.find((c) => c.state !== 'dismissed')
  if (capture?.state === 'extracted') break
  await new Promise((res) => setTimeout(res, 5000))
}
if (capture?.state !== 'extracted') {
  console.error('FAIL: capture never reached extracted:', capture?.state, capture?.draft_error)
  process.exit(1)
}
const drafts = JSON.parse(capture.drafts ?? '[]')
const joined = drafts.join('\n\n')
const checks = [
  ['drafts non-empty', drafts.length >= 4],
  ['points legs', joined.includes('Assets:Rewards:Axis:Pending')],
  ['fuel earns no points', !/Pending/.test(drafts.find((d) => d.includes('FUEL')) ?? '')],
  ['payment clearing', joined.includes('Assets:Clearing:CardPayments')],
  ['balance bookend', joined.includes('balance Liabilities:CreditCards:Axis')],
  ['pad plug', joined.includes('Equity:Adjustments')],
]
let fail = 0
for (const [name, ok] of checks) {
  console.log(ok ? 'PASS' : 'FAIL', name)
  if (!ok) fail++
}

// 2. Screenshots as the test user.
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.addCookies([
  { name: 'mv-test-token', value: encodeURIComponent(TOKEN), url: BASE },
])
const page = await ctx.newPage()
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.screenshot({ path: '/tmp/e2e-vault.png', fullPage: true })
await page.goto(`${BASE}/inbox`, { waitUntil: 'networkidle' })
await page.screenshot({ path: '/tmp/e2e-inbox.png', fullPage: true })
await browser.close()
console.log('screenshots: /tmp/e2e-vault.png /tmp/e2e-inbox.png')
if (fail) process.exit(1)
console.log('SMOKE PASS')

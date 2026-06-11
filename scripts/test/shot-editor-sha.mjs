import { chromium } from '@playwright/test'
const BASE = 'https://staging.milesvault.com'
const TOKEN = process.env.TEST_USER_TOKEN
const WANT = process.argv[2] || ''
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
await ctx.addCookies([{ name: 'mv-test-token', value: encodeURIComponent(TOKEN), url: BASE }])
const page = await ctx.newPage()
let sha = ''
for (let i = 0; i < 8; i++) {
  await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  sha = (await page.evaluate(() => document.body.innerText.match(/[0-9a-f]{7}/)?.[0] ?? '')) || ''
  if (!WANT || sha.startsWith(WANT)) break
  await page.waitForTimeout(8000)
}
console.log('rendered SHA:', sha)
await page.screenshot({ path: '/tmp/editor-toolbar.png' })
await browser.close()

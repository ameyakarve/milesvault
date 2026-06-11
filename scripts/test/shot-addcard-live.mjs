import { chromium } from '@playwright/test'
const BASE = 'https://staging.milesvault.com'
const TOKEN = process.env.TEST_USER_TOKEN
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1100, height: 820 } })
await ctx.addCookies([{ name: 'mv-test-token', value: encodeURIComponent(TOKEN), url: BASE }])
const page = await ctx.newPage()
await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
// open add-card via the chip
await page.getByText('Add a card', { exact: true }).first().click()
await page.waitForTimeout(1500)
await page.screenshot({ path: '/tmp/addcard-live.png' })
// pick issuer Axis to show the cascade
try {
  await page.getByText('Choose a bank').click()
  await page.waitForTimeout(400)
  await page.getByRole('option', { name: 'Axis Bank' }).click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: '/tmp/addcard-live2.png' })
} catch (e) { console.log('cascade step skipped:', String(e).slice(0,80)) }
await browser.close()
console.log('shots ready')

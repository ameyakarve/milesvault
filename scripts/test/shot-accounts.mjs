import { chromium } from '@playwright/test'
const BASE = 'https://staging.milesvault.com'
const TOKEN = process.env.TEST_USER_TOKEN
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1100, height: 860 } })
await ctx.addCookies([{ name: 'mv-test-token', value: encodeURIComponent(TOKEN), url: BASE }])
const page = await ctx.newPage()
await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
// Add accounts → Programmes tab
await page.getByText('Add accounts', { exact: true }).first().click()
await page.waitForTimeout(800)
await page.getByText('programmes', { exact: true }).click()
await page.waitForTimeout(2000)
await page.screenshot({ path: '/tmp/acct-programmes.png' })
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
// Update balance
await page.getByText('Update balance', { exact: true }).first().click()
await page.waitForTimeout(1000)
await page.screenshot({ path: '/tmp/update-balance.png' })
await browser.close()
console.log('shots ready')

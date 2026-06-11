import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'
const URL = 'http://localhost:6006/iframe.html?id=ledger-per-account-view-fixture--prefix-scope&viewMode=story'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const res = await page.goto(URL, { waitUntil: 'networkidle' })
if (!res || !res.ok()) throw new Error(`failed ${URL}: ${res?.status()}`)
await page.waitForSelector('.cm-content', { timeout: 8000 })
const chips = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button'))
  return buttons
    .filter((b) => b.className.includes('rounded-full'))
    .map((b) => b.textContent?.trim() ?? '')
})
console.log('chip texts:', JSON.stringify(chips, null, 2))
const buf = await page.screenshot({ fullPage: false })
writeFileSync('/tmp/fixture-prefix-scope.png', buf)
console.log('snapped /tmp/fixture-prefix-scope.png')
await browser.close()

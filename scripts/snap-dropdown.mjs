import { chromium } from '@playwright/test'

const URL = 'http://localhost:6006/iframe.html?id=ledger-per-account-view-fixture--default&viewMode=story'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)

// closed state
const closedBuf = await page.screenshot({ clip: { x: 48, y: 0, width: 1100, height: 110 } })
import('node:fs').then((fs) => fs.writeFileSync('/tmp/dropdown-closed.png', closedBuf))

// click currency button
const curBtn = page.locator('button:has-text("INR"), button:has-text("USD"), button:has-text("EUR"), button:has-text("GBP"), button:has-text("CNY")').first()
const cnt = await curBtn.count()
console.log('currency buttons found:', cnt)
if (cnt > 0) {
  await curBtn.click()
  await page.waitForTimeout(150)
  const openBuf = await page.screenshot({ clip: { x: 48, y: 0, width: 1100, height: 200 } })
  import('node:fs').then((fs) => fs.writeFileSync('/tmp/dropdown-currency-open.png', openBuf))
  // close
  await page.click('body', { position: { x: 50, y: 800 } })
  await page.waitForTimeout(150)
}

// click period button
const perBtn = page.locator('button:has-text("All time"), button:has-text("This year")').first()
const pcnt = await perBtn.count()
console.log('period buttons found:', pcnt)
if (pcnt > 0) {
  await perBtn.click()
  await page.waitForTimeout(150)
  const openBuf = await page.screenshot({ clip: { x: 48, y: 0, width: 1100, height: 250 } })
  import('node:fs').then((fs) => fs.writeFileSync('/tmp/dropdown-period-open.png', openBuf))
}

console.log('snapped /tmp/dropdown-closed.png, /tmp/dropdown-currency-open.png, /tmp/dropdown-period-open.png')
await browser.close()

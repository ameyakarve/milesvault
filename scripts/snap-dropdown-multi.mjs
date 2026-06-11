import { chromium } from '@playwright/test'

const URL = 'http://localhost:6006/iframe.html?id=ledger-per-account-view-fixture--multi-currency&viewMode=story'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

// closed
const closedBuf = await page.screenshot({ clip: { x: 48, y: 0, width: 1100, height: 110 } })
import('node:fs').then((fs) => fs.writeFileSync('/tmp/dropdown-closed.png', closedBuf))

// click currency button
const curBtn = page.locator('button:has-text("INR")').first()
await curBtn.click()
await page.waitForTimeout(150)
const curOpen = await page.screenshot({ clip: { x: 48, y: 0, width: 1100, height: 220 } })
import('node:fs').then((fs) => fs.writeFileSync('/tmp/dropdown-currency-open.png', curOpen))

// close & test selection
await page.locator('[role="menuitem"]:has-text("USD")').click()
await page.waitForTimeout(300)
const afterSelect = await page.screenshot({ clip: { x: 48, y: 0, width: 1100, height: 110 } })
import('node:fs').then((fs) => fs.writeFileSync('/tmp/dropdown-after-select.png', afterSelect))

await browser.close()
console.log('snapped /tmp/dropdown-closed.png, /tmp/dropdown-currency-open.png, /tmp/dropdown-after-select.png')

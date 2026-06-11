import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 1474 },
  deviceScaleFactor: 2,
})
const page = await ctx.newPage()
await ctx.clearCookies()
await page.goto(
  'http://localhost:6006/iframe.html?id=ledgernew-shell--stitch-v-5&viewMode=story&_=' + Date.now(),
  { waitUntil: 'domcontentloaded' },
)
await page.waitForSelector('.cm-content', { timeout: 15000 })
await page.waitForTimeout(2500)
const lines = await page.locator('.cm-content .cm-line').all()
// click on a different card so card 1 is NOT selected
await lines[lines.length - 2].click({ position: { x: 5, y: 5 } })
await page.waitForTimeout(400)
await page.screenshot({ path: '/tmp/ss-card1-unselected.png', fullPage: true })
console.log('unselected ok')
await browser.close()

import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
})
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text())
})
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
await page.goto(
  'http://localhost:6006/iframe.html?id=ledgernew-twopane--default&viewMode=story&_=' + Date.now(),
  { waitUntil: 'domcontentloaded' },
)
await page.waitForTimeout(4000)
await page.screenshot({ path: '/tmp/ss-twopane.png', fullPage: false })
console.log('shot saved')
console.log('--- ERRORS ---')
for (const e of errors) console.log(e)
await browser.close()

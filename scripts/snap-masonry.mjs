import pkg from '/Users/vandanakarve/milesvault/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.js'
const { chromium } = pkg

const URL =
  'http://localhost:6006/iframe.html?id=ledger-credit-card-dashboard--default&viewMode=story'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.screenshot({ path: '/tmp/cc-masonry.png', fullPage: true })
console.log('snapped /tmp/cc-masonry.png')
await browser.close()

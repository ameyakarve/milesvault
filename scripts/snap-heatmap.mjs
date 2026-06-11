import pkg from '/Users/vandanakarve/milesvault/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.js'
const { chromium } = pkg

const URL =
  'http://localhost:6006/iframe.html?id=ledger-credit-card-dashboard--default&viewMode=story'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

const card = await page.evaluateHandle(() => {
  const cards = [...document.querySelectorAll('div')].filter((d) =>
    d.textContent?.startsWith('Spend calendar') && d.textContent.length < 300,
  )
  return cards[0]?.closest('[class*="rounded-md"]') ?? cards[0]
})
const box = await card.boundingBox()
if (!box) {
  console.log('no card box')
  await browser.close()
  process.exit(1)
}
await page.screenshot({
  path: '/tmp/heatmap.png',
  clip: { x: box.x - 4, y: box.y - 4, width: box.width + 8, height: box.height + 8 },
})
console.log('snapped /tmp/heatmap.png at', box)
await browser.close()

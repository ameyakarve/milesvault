import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 700, height: 460 } })).newPage()
const url = 'http://localhost:6006/iframe.html?id=vault-cardtile--default&viewMode=story'
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
// Vite "Outdated Optimize Dep" heals on reload — try up to 3 times.
for (let i = 0; i < 3; i++) {
  const broken = await page.evaluate(() => document.body.innerText.includes('Failed to fetch dynamically'))
  if (!broken) break
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
}
await page.screenshot({ path: '/tmp/card-tile.png' })
await browser.close()

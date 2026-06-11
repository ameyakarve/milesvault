import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 560, height: 420 } })).newPage()
const url = 'http://localhost:6006/iframe.html?id=addcard-picker--default&viewMode=story'
await page.goto(url, { waitUntil: 'networkidle' })
for (let i = 0; i < 3; i++) {
  if (!(await page.evaluate(() => document.body.innerText.includes('Failed to fetch')))) break
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
}
await page.waitForTimeout(800)
await page.screenshot({ path: '/tmp/addcard.png' })
await browser.close()

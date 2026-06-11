import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 3 })

await page.goto('http://localhost:6006/iframe.html?id=ledgernew-editor--card-mode&viewMode=story', {
  waitUntil: 'networkidle',
})
await page.waitForTimeout(1200)

await page.screenshot({ path: '/tmp/cardmode-shots/zoom.png', clip: { x: 0, y: 0, width: 700, height: 500 } })
await browser.close()

import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 2 })
page.on('pageerror', (e) => console.error('[pageerror]', e.message))

await page.goto('http://localhost:6006/iframe.html?id=ledgernew-editor--kitchen-sink&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await page.locator('.cm-content').first().click({ position: { x: 60, y: 50 } })
await page.waitForTimeout(200)
await page.keyboard.press('Meta+i')
await page.waitForTimeout(400)

const rect = await page.evaluate(() => {
  const w = document.querySelector('.cm-ai-widget')
  return w?.getBoundingClientRect()
})
console.log('widget rect:', rect)

await page.screenshot({ path: '/tmp/cardmode-shots/ai-widget-final.png', clip: { x: 0, y: 0, width: 900, height: 400 } })
await browser.close()

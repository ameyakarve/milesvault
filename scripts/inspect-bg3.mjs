import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1474 } })
const page = await ctx.newPage()
await page.goto('http://localhost:6006/iframe.html?id=ledgernew-shell--stitch-v-5&viewMode=story', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.cm-content', { timeout: 15000 })
await page.waitForTimeout(1500)
const out = await page.evaluate(() => {
  const allRules = []
  for (const sheet of document.styleSheets) {
    try {
      for (const r of sheet.cssRules) {
        if (r.cssText && r.cssText.includes('scandi-backdrop')) {
          allRules.push({ href: sheet.href, text: r.cssText })
        }
      }
    } catch (e) { /* cross-origin */ }
  }
  return allRules
})
console.log(JSON.stringify(out, null, 2))
await browser.close()

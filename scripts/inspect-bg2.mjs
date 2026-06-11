import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1474 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto('http://localhost:6006/iframe.html?id=ledgernew-shell--stitch-v-5&viewMode=story', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.cm-content', { timeout: 15000 })
await page.waitForTimeout(1500)
const out = await page.evaluate(() => {
  const main = document.querySelector('main')
  const css = main ? getComputedStyle(main).backgroundColor : null
  // find which CSS rule applies
  const sheets = Array.from(document.styleSheets).map(sheet => {
    try {
      return Array.from(sheet.cssRules).filter(r => r.cssText && r.cssText.includes('scandi-backdrop')).map(r => r.cssText)
    } catch (e) { return [] }
  }).flat()
  return { css, rules: sheets.slice(0, 5) }
})
console.log(JSON.stringify(out, null, 2))
await browser.close()

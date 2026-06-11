import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await ctx.clearCookies()
await page.goto('http://localhost:6006/iframe.html?id=ledgernew-editor--kitchen-sink&viewMode=story&_=' + Date.now(), { waitUntil: 'networkidle' })
await page.waitForSelector('.cm-content', { timeout: 15000 })
await page.waitForTimeout(1500)
await page.screenshot({ path: '/tmp/ss-kitchen.png', fullPage: false })
const info = await page.evaluate(() => {
  const glyphs = [...document.querySelectorAll('.cm-account-glyph')].filter((g) => g.querySelector('svg'))
  return glyphs.slice(0, 6).map((g) => {
    const svg = g.querySelector('svg')
    const label = g.querySelector('.cm-account-glyph-chip')
    return {
      outer: g.outerHTML.slice(0, 200),
      glyphH: g.getBoundingClientRect().height,
      svgRect: { x: svg.getBoundingClientRect().x, y: svg.getBoundingClientRect().y, w: svg.getBoundingClientRect().width, h: svg.getBoundingClientRect().height },
      labelRect: label ? { x: label.getBoundingClientRect().x, y: label.getBoundingClientRect().y, w: label.getBoundingClientRect().width } : null,
    }
  })
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
console.log('ok')

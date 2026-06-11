import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1474 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto('http://localhost:6006/iframe.html?id=ledgernew-shell--stitch-v-5&viewMode=story&_=' + Date.now(), { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.cm-content', { timeout: 15000 })
await page.waitForTimeout(2500)
const lines = await page.locator('.cm-content .cm-line').all()
await lines[0].click({ position: { x: 5, y: 5 } })
await page.waitForTimeout(400)
const info = await page.evaluate(() => {
  const out = []
  document.querySelectorAll('.cm-line.cm-card-active').forEach((l, i) => {
    const r = l.getBoundingClientRect()
    const cs = getComputedStyle(l)
    const childInfo = []
    l.querySelectorAll('*').forEach(c => {
      const cr = c.getBoundingClientRect()
      const ccs = getComputedStyle(c)
      if (ccs.backgroundColor !== 'rgba(0, 0, 0, 0)' && ccs.backgroundColor !== 'transparent') {
        childInfo.push({tag: c.tagName, cls: c.className, bg: ccs.backgroundColor, x: cr.left, w: cr.width, h: cr.height})
      }
    })
    out.push({
      i, cls: l.className,
      x: r.left, y: r.top, w: r.width, h: r.height,
      bg: cs.background.slice(0, 100),
      bgImage: cs.backgroundImage.slice(0, 100),
      paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom,
      lineHeight: cs.lineHeight,
      children: childInfo,
    })
  })
  return out
})
console.log(JSON.stringify(info, null, 2))
await browser.close()

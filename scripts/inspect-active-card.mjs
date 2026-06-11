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
  document.querySelectorAll('.cm-line').forEach((l, i) => {
    if (l.classList.contains('cm-card-active') || l.classList.contains('cm-card-first') || l.classList.contains('cm-card-last') || (i < 10)) {
      const r = l.getBoundingClientRect()
      const cs = getComputedStyle(l)
      out.push({
        i,
        cls: l.className,
        y: r.top, h: r.height,
        borderTop: cs.borderTopColor + ' ' + cs.borderTopWidth,
        borderBottom: cs.borderBottomColor + ' ' + cs.borderBottomWidth,
        text: l.textContent?.slice(0, 40),
      })
    }
  })
  return out
})
console.log(JSON.stringify(info.slice(0, 20), null, 2))
await browser.close()

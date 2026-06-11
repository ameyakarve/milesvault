import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage()
await page.goto('http://localhost:6006/iframe.html?id=editor-filterbar--default&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

// Open the date popover
await page.click('text=All time')
await page.waitForTimeout(600)

const report = await page.evaluate(() => {
  const out = []
  const all = document.querySelectorAll('body *')
  for (const el of all) {
    const cs = getComputedStyle(el)
    const fields = {
      outlineColor: cs.outlineColor, outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle,
      borderTopColor: cs.borderTopColor, borderTopWidth: cs.borderTopWidth,
      boxShadow: cs.boxShadow,
    }
    const blueish = (c) => {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c)
      if (!m) return false
      const [r, g, b] = [+m[1], +m[2], +m[3]]
      return b > 100 && b > r + 40 && b > g + 30
    }
    const hits = []
    if (cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px' && blueish(cs.outlineColor)) hits.push(`outline ${cs.outlineWidth} ${cs.outlineColor}`)
    if (parseFloat(cs.borderTopWidth) > 0 && blueish(cs.borderTopColor)) hits.push(`border ${cs.borderTopWidth} ${cs.borderTopColor}`)
    if (blueish(cs.boxShadow)) hits.push(`shadow ${cs.boxShadow.slice(0, 120)}`)
    if (hits.length) {
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className?.toString?.() ?? '').slice(0, 140),
        slot: el.getAttribute('data-slot'),
        hits,
      })
    }
  }
  return out
})
console.log(JSON.stringify(report, null, 1))
await page.screenshot({ path: '/tmp/popover-date.png' })
await browser.close()

import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
})
const page = await ctx.newPage()
await page.goto(
  'http://localhost:6006/iframe.html?id=ledgernew-twopane--default&viewMode=story&_=' + Date.now(),
  { waitUntil: 'domcontentloaded' },
)
await page.waitForTimeout(4500)

const m = await page.evaluate(() => {
  function box(sel) {
    const el = document.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) }
  }
  const dayGutter = box('.cm-day-label-gutter')
  const lineNumGutter = box('.cm-lineNumbers')
  const allGutters = box('.cm-gutters')
  const cmContent = box('.cm-content')
  const firstLine = box('.cm-line')
  const filterText = document.querySelector('span.text-\\[11px\\].font-sans.text-slate-400')
  const filterLeft = filterText ? Math.round(filterText.getBoundingClientRect().left) : null
  return {
    cmGutters: allGutters,
    dayGutter,
    lineNumGutter,
    cmContent,
    firstLine,
    filterText: filterLeft,
  }
})
console.log(JSON.stringify(m, null, 2))
await browser.close()

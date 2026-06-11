import { chromium } from '@playwright/test'

const URL = 'http://localhost:6006/iframe.html?id=accounts-directory-fixture--default&viewMode=story'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

const rects = await page.evaluate(() => {
  const headerRow = document.querySelector('main > div.flex-1 > div > div')
  // find the table header
  const h = Array.from(document.querySelectorAll('div')).find((el) => {
    if (el.children.length !== 4) return false
    const childTexts = Array.from(el.children).map((c) => (c.textContent || '').trim())
    return childTexts[0] === 'Account' && childTexts[1] === 'Last Activity' && childTexts[2] === 'CCY' && childTexts[3] === 'Balance'
  })
  if (!h) return { error: 'header row not found' }
  const cells = Array.from(h.children).map((c) => {
    const cs = getComputedStyle(c)
    const r = c.getBoundingClientRect()
    return {
      text: c.textContent,
      x: Math.round(r.x),
      width: Math.round(r.width),
      paddingLeft: cs.paddingLeft,
      paddingRight: cs.paddingRight,
      marginLeft: cs.marginLeft,
      letterSpacing: cs.letterSpacing,
      fontSize: cs.fontSize,
    }
  })
  return { rowOuter: { x: Math.round(h.getBoundingClientRect().x), w: Math.round(h.getBoundingClientRect().width) }, cells }
})
console.log(JSON.stringify(rects, null, 2))
await browser.close()

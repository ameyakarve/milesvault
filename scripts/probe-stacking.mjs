import { chromium } from '@playwright/test'
const PORT = process.env.STORYBOOK_PORT || '6006'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto(`http://localhost:${PORT}/iframe.html?id=ledger-per-account-view-fixture--default&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForSelector('.cm-content', { timeout: 10000 })
await page.click('.cm-content')
await page.keyboard.press('Meta+a')
await page.waitForTimeout(300)

const probe = await page.evaluate(() => {
  const layer = document.querySelector('.cm-selectionLayer')
  const line = document.querySelector('.cm-line')
  const content = document.querySelector('.cm-content')
  const scroller = document.querySelector('.cm-scroller')
  const get = (el) => {
    if (!el) return null
    const cs = window.getComputedStyle(el)
    return {
      tag: el.tagName + '.' + el.className.split(' ').slice(0,3).join('.'),
      position: cs.position,
      zIndex: cs.zIndex,
      backgroundColor: cs.backgroundColor,
      parent: el.parentElement?.className || null,
    }
  }
  return {
    layer: get(layer),
    line: get(line),
    content: get(content),
    scroller: get(scroller),
    layerSibling: layer?.parentElement?.className || null,
    contentParent: content?.parentElement?.className || null,
    layerSiblings: layer ? Array.from(layer.parentElement.children).map(c => c.className) : [],
  }
})
console.log(JSON.stringify(probe, null, 2))
await browser.close()

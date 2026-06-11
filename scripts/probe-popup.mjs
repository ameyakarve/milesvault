import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
await page.goto('http://localhost:6006/iframe.html?id=editor-filterbar--default&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.click('text=All time')
await page.waitForTimeout(600)
const r = await page.evaluate(() => {
  const popup = document.querySelector('[data-slot="popover-content"]')
  const positioner = popup?.parentElement
  const active = document.activeElement
  const dump = (el, name) => {
    if (!el) return { name, missing: true }
    const cs = getComputedStyle(el)
    return {
      name,
      tag: el.tagName,
      isActive: el === active,
      outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
      border: `${cs.borderTopStyle} ${cs.borderTopWidth} ${cs.borderTopColor}`,
      boxShadow: cs.boxShadow.slice(0, 200),
      cls: (el.className?.toString?.() ?? '').slice(0, 100),
    }
  }
  return {
    active: dump(active, 'activeElement'),
    popup: dump(popup, 'popup'),
    positioner: dump(positioner, 'positioner'),
  }
})
console.log(JSON.stringify(r, null, 1))
await browser.close()

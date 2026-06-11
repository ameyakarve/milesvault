import { chromium } from '@playwright/test'
const b = await chromium.launch()
const c = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const p = await c.newPage()
await p.goto('http://localhost:6006/iframe.html?id=ledgernew-editor--kitchen-sink&viewMode=story&_=' + Date.now(), { waitUntil: 'networkidle' })
await p.waitForSelector('.cm-content', { timeout: 15000 })
await p.waitForTimeout(1200)
const info = await p.evaluate(() => {
  const gutters = [...document.querySelectorAll('.cm-lineNumbers .cm-gutterElement')].slice(0, 8)
  return gutters.map((g) => ({
    text: g.textContent,
    cls: g.className,
    bg: getComputedStyle(g).backgroundColor,
  }))
})
console.log(JSON.stringify(info, null, 2))
await b.close()

import { chromium } from '@playwright/test'
const b = await chromium.launch()
const c = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const p = await c.newPage()
await p.goto('http://localhost:6006/iframe.html?id=ledgernew-editor--kitchen-sink&viewMode=story&_=' + Date.now(), { waitUntil: 'networkidle' })
await p.waitForSelector('.cm-content', { timeout: 15000 })
await p.waitForTimeout(1200)
const info = await p.evaluate(() => {
  const lines = [...document.querySelectorAll('.cm-line')].slice(0, 5)
  return lines.map((l) => {
    const spans = [...l.querySelectorAll('.cm-space-dots')].map((s) => ({
      text: JSON.stringify(s.textContent),
      bg: getComputedStyle(s).backgroundImage.slice(0, 40),
      parent: s.parentElement?.className || '',
    }))
    return { text: l.textContent, html: l.innerHTML.slice(0, 300), spans }
  })
})
console.log(JSON.stringify(info, null, 2))
await b.close()

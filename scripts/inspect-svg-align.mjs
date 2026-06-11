import { chromium } from '@playwright/test'
const b = await chromium.launch()
const c = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const p = await c.newPage()
await p.goto('http://localhost:6006/iframe.html?id=ledgernew-editor--kitchen-sink&viewMode=story&_=' + Date.now(), { waitUntil: 'networkidle' })
await p.waitForSelector('.cm-content', { timeout: 15000 })
await p.waitForTimeout(1200)
const info = await p.evaluate(() => {
  const getInnerText = (el) => {
    const range = document.createRange()
    const texts = []
    const walk = (n) => {
      if (n.nodeType === 3 && n.textContent.trim()) texts.push(n)
      else if (n.nodeType === 1) n.childNodes.forEach(walk)
    }
    walk(el)
    if (!texts.length) return null
    range.setStart(texts[0], 0)
    range.setEnd(texts[texts.length - 1], texts[texts.length - 1].textContent.length)
    const r = range.getBoundingClientRect()
    return { top: +r.top.toFixed(2), bottom: +r.bottom.toFixed(2) }
  }
  const rect = (el) => {
    const r = el.getBoundingClientRect()
    return { top: +r.top.toFixed(2), bottom: +r.bottom.toFixed(2), h: +r.height.toFixed(2) }
  }
  const chips = [...document.querySelectorAll('.cm-account-glyph')].slice(0, 10)
  return chips.map((chip) => {
    const svg = chip.querySelector('svg')
    const label = chip.querySelector('.cm-account-glyph-chip')
    const line = chip.closest('.cm-line')
    return {
      aria: chip.getAttribute('aria-label'),
      line: line ? rect(line) : null,
      chip: rect(chip),
      svg: svg ? rect(svg) : null,
      labelText: label ? getInnerText(label) : null,
    }
  })
})
console.log(JSON.stringify(info, null, 2))
await b.close()

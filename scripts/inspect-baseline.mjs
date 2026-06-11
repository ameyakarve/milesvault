import { chromium } from '@playwright/test'
const b = await chromium.launch()
const c = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const p = await c.newPage()
await p.goto('http://localhost:6006/iframe.html?id=ledgernew-editor--kitchen-sink&viewMode=story&_=' + Date.now(), { waitUntil: 'networkidle' })
await p.waitForSelector('.cm-content', { timeout: 15000 })
await p.waitForTimeout(1200)
const info = await p.evaluate(() => {
  const innerTextRect = (el) => {
    const range = document.createRange()
    const textNode = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())
    if (!textNode) return null
    range.selectNodeContents(textNode)
    const r = range.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom }
  }
  const lines = [...document.querySelectorAll('.cm-line')].slice(0, 8)
  return lines.map((l, idx) => {
    const rawTextSpan = [...l.querySelectorAll('span')].find((s) => {
      return !s.closest('.cm-account-glyph') && !s.closest('.cm-amount-chip') && !s.classList.contains('cm-highlightSpace') && [...s.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    })
    const glyphLabel = l.querySelector('.cm-account-glyph-chip')
    const amountChip = l.querySelector('.cm-amount-chip')
    return {
      idx,
      text: l.textContent.slice(0, 40),
      rawText: rawTextSpan ? innerTextRect(rawTextSpan) : null,
      glyphText: glyphLabel ? innerTextRect(glyphLabel) : null,
      amountText: amountChip ? innerTextRect(amountChip) : null,
    }
  })
})
console.log(JSON.stringify(info, null, 2))
await b.close()

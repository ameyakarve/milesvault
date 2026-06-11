import { chromium } from '@playwright/test'
const b = await chromium.launch()
const c = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const p = await c.newPage()
await p.goto('http://localhost:6006/iframe.html?id=ledgernew-editor--kitchen-sink&viewMode=story&_=' + Date.now(), { waitUntil: 'networkidle' })
await p.waitForSelector('.cm-content', { timeout: 15000 })
await p.waitForTimeout(1200)

async function dump(label) {
  const info = await p.evaluate(() => {
    const innerTextRect = (el) => {
      if (!el) return null
      const range = document.createRange()
      const texts = []
      const walk = (n) => {
        if (n.nodeType === 3 && n.textContent.trim()) texts.push(n)
        else if (n.nodeType === 1) n.childNodes.forEach(walk)
      }
      walk(el)
      if (texts.length === 0) return null
      range.setStart(texts[0], 0)
      range.setEnd(texts[texts.length - 1], texts[texts.length - 1].textContent.length)
      const r = range.getBoundingClientRect()
      return { top: +r.top.toFixed(2), bottom: +r.bottom.toFixed(2), h: +r.height.toFixed(2), text: texts.map((t) => t.textContent).join('').slice(0, 20) }
    }
    const lines = [...document.querySelectorAll('.cm-line')]
    return lines.map((l, idx) => {
      const rawSpans = [...l.querySelectorAll('span')].filter((s) => {
        return !s.closest('.cm-account-glyph') && !s.closest('.cm-amount-chip') && !s.classList.contains('cm-highlightSpace') && !s.classList.contains('cm-space-dots')
      })
      const raw = rawSpans.find((s) => [...s.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
      const labels = [...l.querySelectorAll('.cm-account-glyph-chip')]
      const amounts = [...l.querySelectorAll('.cm-amount-chip')]
      return {
        idx,
        text: l.textContent.trim().slice(0, 50),
        raw: raw ? innerTextRect(raw) : null,
        labels: labels.map(innerTextRect),
        amounts: amounts.map(innerTextRect),
      }
    })
  })
  console.log('\n===', label, '===')
  for (const row of info) {
    if (!row.raw && row.labels.length === 0 && row.amounts.length === 0) continue
    const rawBottom = row.raw?.bottom ?? null
    const deltas = {
      labels: row.labels.map((x) => x ? (rawBottom !== null ? +(x.bottom - rawBottom).toFixed(2) : null) : null),
      amounts: row.amounts.map((x) => x ? (rawBottom !== null ? +(x.bottom - rawBottom).toFixed(2) : null) : null),
    }
    console.log(`#${row.idx}`, JSON.stringify({ text: row.text, rawB: rawBottom, dL: deltas.labels, dA: deltas.amounts }))
  }
}

await dump('idle (no cursor in doc)')

// Click on line 5 in doc (raw text line that has chips) — shifts cursor into chip region => should unveil chips for that line
await p.click('.cm-content', { position: { x: 200, y: 40 } })
await p.waitForTimeout(300)
await dump('after click on header line')

await p.screenshot({ path: '/tmp/ss-align.png', fullPage: false })
await b.close()

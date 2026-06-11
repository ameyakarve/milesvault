import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 1400 }, deviceScaleFactor: 2 })

await page.goto('http://localhost:6006/iframe.html?id=ledgernew-editor--card-mode&viewMode=story', {
  waitUntil: 'networkidle',
})
await page.waitForTimeout(1200)

const info = await page.evaluate(() => {
  // Find the line-number gutter element that visually matches each content line's vertical center
  const lines = [...document.querySelectorAll('.cm-content > .cm-line')]
  const gutterEls = [...document.querySelectorAll('.cm-lineNumbers > .cm-gutterElement')]
  const rows = []
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const lr = lines[i].getBoundingClientRect()
    const mid = lr.top + lr.height / 2
    const matchedGutter = gutterEls.find((g) => {
      const gr = g.getBoundingClientRect()
      return gr.top <= mid && mid <= gr.bottom && gr.height > 2
    })
    rows.push({
      i,
      lineTop: lr.top.toFixed(1),
      lineText: lines[i].textContent.slice(0, 32).replace(/\n/g, '·'),
      matchedNum: matchedGutter?.textContent?.trim() ?? '—',
      gutTop: matchedGutter ? matchedGutter.getBoundingClientRect().top.toFixed(1) : '—',
      diff: matchedGutter
        ? (matchedGutter.getBoundingClientRect().top - lr.top).toFixed(1)
        : '—',
    })
  }
  return rows
})

console.table(info)
await browser.close()

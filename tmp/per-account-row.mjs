import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 2 })
await page.goto(process.argv[2] || 'http://localhost:6006/iframe.html?id=ledger-v4-per-account-view--hdfc-diners-black&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
const r = await page.evaluate(() => {
  // first data row chevron
  const grids = document.querySelectorAll('main .grid')
  const row = grids[1]  // header is 0
  const cells = row.children
  const chevCell = cells[0]
  const chev = chevCell.querySelector('.material-symbols-outlined')
  const dateCell = cells[1]
  const dateSpan = dateCell  // direct text
  const cs = (e) => {
    if (!e) return null
    const s = window.getComputedStyle(e)
    const r = e.getBoundingClientRect()
    return { text: e.textContent?.slice(0,30), w: Math.round(r.width), h: Math.round(r.height), fontSize: s.fontSize, lineHeight: s.lineHeight, fontFamily: s.fontFamily, padding: s.padding }
  }
  return {
    row: cs(row),
    chevCell: cs(chevCell),
    chev: cs(chev),
    dateCell: cs(dateCell),
  }
})
console.log(JSON.stringify(r, null, 2))
await browser.close()

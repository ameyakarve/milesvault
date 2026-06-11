import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 2 })
await page.goto('http://localhost:6006/iframe.html?id=ledger-v4-per-account-view--hdfc-diners-black&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
const r = await page.evaluate(() => {
  const sym = document.querySelector('.material-symbols-outlined')
  const s = window.getComputedStyle(sym)
  const r = sym.getBoundingClientRect()
  // Check if Material Symbols font loaded
  const loaded = document.fonts ? Array.from(document.fonts).map(f => `${f.family}:${f.status}`) : 'no fonts api'
  return {
    text: sym.textContent,
    fontFamily: s.fontFamily,
    fontSize: s.fontSize,
    lineHeight: s.lineHeight,
    width: r.width,
    height: r.height,
    fonts: loaded,
  }
})
console.log(JSON.stringify(r, null, 2))
// Probe textarea
const t = await page.evaluate(() => {
  const ta = document.querySelector('textarea')
  const s = window.getComputedStyle(ta)
  const r = ta.getBoundingClientRect()
  return { width: r.width, height: r.height, fontSize: s.fontSize, lineHeight: s.lineHeight, padding: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`, border: s.borderTopWidth, minHeight: s.minHeight }
})
console.log('textarea:', JSON.stringify(t, null, 2))
await browser.close()

import { chromium } from '@playwright/test'
const PORT = process.env.STORYBOOK_PORT || '6006'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto(`http://localhost:${PORT}/iframe.html?id=ledger-per-account-view-fixture--prefix-scope&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForSelector('.cm-content', { timeout: 10000 })
await page.waitForFunction(() => document.querySelectorAll('.cm-date-header').length > 0, null, { timeout: 8000 })

const headers = await page.evaluate(() => Array.from(document.querySelectorAll('.cm-date-header')).map((el) => {
  const r = el.getBoundingClientRect()
  const cs = window.getComputedStyle(el)
  return {
    text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    bg: cs.backgroundColor,
    fontSize: cs.fontSize,
    fontFamily: cs.fontFamily,
    parentBg: window.getComputedStyle(el.parentElement).backgroundColor,
  }
}))
console.log(JSON.stringify(headers, null, 2))
await page.screenshot({ path: '/tmp/date-header.png', fullPage: false })
await browser.close()

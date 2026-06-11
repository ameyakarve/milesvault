import { chromium } from '@playwright/test'

const URL = 'http://localhost:6006/iframe.html?id=ledger-per-account-view-fixture--statement&viewMode=story'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('.cm-content', { timeout: 8000 })

const data = await page.evaluate(() => {
  // Find each .truncate primary text span (font-medium ones are the payees)
  const spans = document.querySelectorAll('span.text-\\[13px\\].font-medium.text-slate-900.truncate')
  return Array.from(spans).map((el) => {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return {
      text: el.textContent,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      fontFamily: cs.fontFamily,
      width: r.width,
      height: r.height,
      top: r.top,
    }
  })
})

console.log(JSON.stringify(data, null, 2))

await browser.close()

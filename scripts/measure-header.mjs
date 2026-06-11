import { chromium } from '@playwright/test'
const W = 1280
const H = 820
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
async function probe(url, waitSel) {
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: 'networkidle' })
  if (waitSel) await page.waitForSelector(waitSel, { timeout: 30000 })
  await page.waitForTimeout(1500)
  const data = await page.evaluate(() => {
    const round = (n) => Math.round(n * 10) / 10
    const ph = (el, label) => {
      if (!el) return { _label: label, missing: true }
      const r = el.getBoundingClientRect()
      return { _label: label, x: round(r.left), y: round(r.top), w: round(r.width), h: round(r.height), text: (el.textContent||'').replace(/\s+/g, ' ').trim().slice(0, 30) }
    }
    const header = document.querySelector('header')
    const saveBtn = header?.querySelector('button')
    const unsaved = header && Array.from(header.querySelectorAll('span')).find((s) => s.textContent && s.textContent.includes('Unsaved'))
    return [ph(header, 'header'), ph(unsaved, 'unsaved'), ph(saveBtn, 'save')]
  })
  await page.close()
  return data
}
const ref = await probe('http://localhost:7700/refined.html', null)
const mine = await probe('http://localhost:6006/iframe.html?id=ledger-notebook-view--default&viewMode=story&_=' + Date.now(), '.cm-content')
console.log('REF', JSON.stringify(ref, null, 2))
console.log('MINE', JSON.stringify(mine, null, 2))
await browser.close()

import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1474 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto('http://localhost:6006/iframe.html?id=ledgernew-shell--stitch-v-5&viewMode=story&_=' + Date.now(), { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.cm-content', { timeout: 15000 })
await page.waitForTimeout(2500)
const lines = await page.locator('.cm-content .cm-line').all()
await lines[0].click({ position: { x: 5, y: 5 } })
await page.waitForTimeout(400)
const info = await page.evaluate(() => {
  const content = document.querySelector('.cm-content')
  const ce = content.getBoundingClientRect()
  const ccs = getComputedStyle(content)
  const scroller = document.querySelector('.cm-scroller')
  const sr = scroller.getBoundingClientRect()
  const card = document.querySelector('.cm-line.cm-card-active')
  const cr = card.getBoundingClientRect()
  return {
    scroller: { left: sr.left, right: sr.right, w: sr.width },
    content: { left: ce.left, right: ce.right, w: ce.width, padRight: ccs.paddingRight, padLeft: ccs.paddingLeft },
    card: { left: cr.left, right: cr.right, w: cr.width },
  }
})
console.log(info)
await browser.close()

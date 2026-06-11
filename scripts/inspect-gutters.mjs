import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 1474 },
  deviceScaleFactor: 2,
})
const page = await ctx.newPage()
await page.goto(
  'http://localhost:6006/iframe.html?id=ledgernew-shell--stitch-v-5&viewMode=story&_=' + Date.now(),
  { waitUntil: 'domcontentloaded' },
)
await page.waitForSelector('.cm-content', { timeout: 15000 })
await page.waitForTimeout(2000)

const info = await page.evaluate(() => {
  const editor = document.querySelector('.cm-editor')
  const scroller = document.querySelector('.cm-scroller')
  const gutters = document.querySelector('.cm-gutters')
  const gutterChildren = gutters ? [...gutters.children].map(g => ({ class: g.className, w: g.getBoundingClientRect().width })) : []
  const content = document.querySelector('.cm-content')
  const firstLine = document.querySelector('.cm-line.cm-card-first')
  const cs = window.getComputedStyle(content)
  return {
    editor: editor.getBoundingClientRect(),
    scroller: scroller.getBoundingClientRect(),
    gutters: gutters?.getBoundingClientRect(),
    gutterChildren,
    content: content.getBoundingClientRect(),
    contentPadding: cs.padding,
    firstLine: firstLine?.getBoundingClientRect(),
  }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()

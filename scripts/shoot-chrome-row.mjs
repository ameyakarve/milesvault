import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
})
const page = await ctx.newPage()
await page.goto(
  'http://localhost:6006/iframe.html?id=ledgernew-twopane--default&viewMode=story&_=' + Date.now(),
  { waitUntil: 'domcontentloaded' },
)
await page.waitForTimeout(4000)

await page.screenshot({
  path: '/tmp/ss-chrome-only.png',
  clip: { x: 0, y: 0, width: 1440, height: 200 },
})
console.log('chrome-only saved')

const m = await page.evaluate(() => {
  const all = []
  const root = document.querySelector('main')
  if (!root) return null
  const walk = (el, depth = 0) => {
    if (depth > 6) return
    const r = el.getBoundingClientRect()
    if (r.bottom < 200 && r.top < 200 && r.width > 5) {
      const txt = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
        ? el.textContent.trim().slice(0, 40)
        : ''
      all.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 60),
        x: Math.round(r.left),
        right: Math.round(r.right),
        y: Math.round(r.top),
        h: Math.round(r.height),
        w: Math.round(r.width),
        txt,
      })
    }
    for (const c of el.children) walk(c, depth + 1)
  }
  walk(root)
  return all
})
for (const r of m) console.log(JSON.stringify(r))
await browser.close()

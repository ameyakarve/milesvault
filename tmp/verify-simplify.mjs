import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 })

await page.goto('http://localhost:6006/iframe.html?id=ledgernew-editor--card-mode&viewMode=story', {
  waitUntil: 'networkidle',
})
await page.waitForTimeout(1200)

const info = await page.evaluate(() => {
  const sample = (el) => {
    if (!el) return null
    const cs = getComputedStyle(el)
    return {
      cls: el.className.trim(),
      bg: cs.backgroundColor,
      bbottom: cs.borderBottom.slice(0, 40),
      shadow: cs.boxShadow.slice(0, 60),
    }
  }
  const firstDesc = document.querySelector('.cm-txn-desc')
  const firstCardFirst = document.querySelector('.cm-line.cm-card-first')
  const firstCardLast = document.querySelector('.cm-line.cm-card-last')
  return {
    scroller: sample(document.querySelector('.cm-scroller')),
    firstDesc: sample(firstDesc),
    firstCardFirst: sample(firstCardFirst),
    firstCardLast: sample(firstCardLast),
  }
})

console.log(JSON.stringify(info, null, 2))
await page.screenshot({ path: '/tmp/cardmode-shots/post-simplify.png', clip: { x: 0, y: 0, width: 700, height: 600 } })
await browser.close()

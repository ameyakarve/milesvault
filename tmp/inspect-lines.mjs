import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 3 })

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
      bbottom: cs.borderBottom,
      btop: cs.borderTop,
      shadow: cs.boxShadow.slice(0, 120),
      bradius: `${cs.borderTopLeftRadius}/${cs.borderBottomLeftRadius}`,
    }
  }
  const firstDesc = document.querySelector('.cm-txn-desc')
  const firstCardFirst = document.querySelector('.cm-line.cm-card-first')
  const firstCardMid = document.querySelector('.cm-line.cm-card-mid')
  const firstCardLast = document.querySelector('.cm-line.cm-card-last')
  const firstBlankLine = [...document.querySelectorAll('.cm-line')].find(l => !l.classList.contains('cm-card'))
  const firstGutterElement = document.querySelector('.cm-lineNumbers .cm-gutterElement')
  return {
    scroller: sample(document.querySelector('.cm-scroller')),
    content: sample(document.querySelector('.cm-content')),
    firstDesc: sample(firstDesc),
    firstCardFirst: sample(firstCardFirst),
    firstCardMid: sample(firstCardMid),
    firstCardLast: sample(firstCardLast),
    firstBlankLine: sample(firstBlankLine),
    firstGutterElement: sample(firstGutterElement),
  }
})

console.log(JSON.stringify(info, null, 2))
await page.screenshot({ path: '/tmp/cardmode-shots/zoom2.png', clip: { x: 0, y: 0, width: 700, height: 300 } })
await browser.close()

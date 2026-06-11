import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 1400 }, deviceScaleFactor: 2 })

await page.goto('http://localhost:6006/iframe.html?id=ledgernew-editor--card-mode&viewMode=story', {
  waitUntil: 'networkidle',
})
await page.waitForTimeout(1200)

const info = await page.evaluate(() => {
  const lines = document.querySelectorAll('.cm-line')
  const sample = []
  for (let i = 0; i < Math.min(8, lines.length); i++) {
    const l = lines[i]
    const cs = getComputedStyle(l)
    sample.push({
      i,
      cls: l.className,
      bg: cs.backgroundColor,
      mt: cs.marginTop,
      radius: [cs.borderTopLeftRadius, cs.borderBottomLeftRadius].join('/'),
      shadow: cs.boxShadow.slice(0, 80),
      text: l.textContent.slice(0, 50),
    })
  }
  const scroller = document.querySelector('.cm-scroller')
  const content = document.querySelector('.cm-content')
  return {
    lineCount: lines.length,
    scrollerBg: scroller ? getComputedStyle(scroller).backgroundColor : null,
    contentBg: content ? getComputedStyle(content).backgroundColor : null,
    sample,
  }
})

console.log(JSON.stringify(info, null, 2))
await browser.close()

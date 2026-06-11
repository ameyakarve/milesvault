import { chromium } from '@playwright/test'

const STORYBOOK_URL = process.env.STORYBOOK_URL ?? 'http://localhost:6006'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto(`${STORYBOOK_URL}/iframe.html?id=home-chrome--stitch-parity&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)

const allCss = await page.evaluate(() => {
  let total = ''
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules ?? [])) {
        total += rule.cssText + '\n'
      }
    } catch (e) {}
  }
  return total
})

console.log('Total CSS length:', allCss.length)
const tests = ['bg-background', 'bg-surface-container', 'border-outline', '244, 246, 248', '226, 232, 240', '\\.bg-outline', '\\.text-outline']
for (const t of tests) {
  const re = new RegExp(t.replace(/\./g, '\\.'), 'g')
  const matches = allCss.match(re)
  console.log(`"${t}": ${matches ? matches.length : 0} matches`)
}
await browser.close()

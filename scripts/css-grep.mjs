import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
await page.goto('http://localhost:6006/iframe.html?id=editor-filterbar--default&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
const found = await page.evaluate(() => {
  const hits = []
  for (const sheet of document.styleSheets) {
    let rules
    try { rules = sheet.cssRules } catch { continue }
    for (const r of rules) {
      const t = r.cssText ?? ''
      if (t.includes('ring-foreground') || (t.includes('--tw-ring-color') && t.includes('color-mix'))) hits.push(t.slice(0, 160))
    }
  }
  return hits.slice(0, 6)
})
console.log(JSON.stringify(found, null, 1))
await browser.close()

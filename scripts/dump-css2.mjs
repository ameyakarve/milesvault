import { chromium } from '@playwright/test'

const STORYBOOK_URL = process.env.STORYBOOK_URL ?? 'http://localhost:6006'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto(`${STORYBOOK_URL}/iframe.html?id=home-chrome--stitch-parity&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)

const css = await page.evaluate(() => {
  const out = []
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules ?? [])) {
        const t = rule.cssText
        if (t.includes('surface-container') || t.includes('.bg-outline') || t.includes('.border-outline') || t.includes('.bg-background') || t.includes('.bg-surface')) out.push(t)
      }
    } catch (e) {}
  }
  return out
})
console.log(`Found ${css.length} matching rules:`)
for (const r of css) console.log(r.slice(0, 300))
await browser.close()

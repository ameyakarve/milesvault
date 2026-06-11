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
        if (t.includes('surface-container') || t.includes('outline') || t.includes('background') || t.match(/border-color/)) out.push(t)
      }
    } catch (e) {}
  }
  return out.slice(0, 60)
})
for (const r of css) console.log(r.slice(0, 200))
await browser.close()

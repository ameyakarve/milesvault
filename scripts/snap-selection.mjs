import { chromium } from '@playwright/test'
const PORT = process.env.STORYBOOK_PORT || '6006'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto(`http://localhost:${PORT}/iframe.html?id=ledger-per-account-view-fixture--default&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForSelector('.cm-content', { timeout: 10000 })

// Triple-click a line to select it
await page.click('.cm-content')
await page.keyboard.press('Meta+a')
await page.waitForTimeout(300)

const probe = await page.evaluate(() => {
  const sel = document.querySelectorAll('.cm-selectionBackground')
  const layer = document.querySelector('.cm-selectionLayer')
  const out = {
    selectionBgCount: sel.length,
    selectionLayerExists: !!layer,
    rules: [],
  }
  if (sel.length > 0) {
    const cs = window.getComputedStyle(sel[0])
    out.firstBg = cs.backgroundColor
    out.firstRect = sel[0].getBoundingClientRect()
  }
  // Hunt for cm-selectionBackground rules in stylesheets
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules || []) {
        const t = rule.cssText || ''
        if (t.includes('selectionBackground') || t.includes('selection')) {
          out.rules.push(t.slice(0, 200))
        }
      }
    } catch {}
  }
  return out
})
console.log(JSON.stringify(probe, null, 2))
await page.screenshot({ path: '/tmp/selection.png', fullPage: false })
await browser.close()

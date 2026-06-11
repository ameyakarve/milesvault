import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 2 })
const url = 'http://localhost:6006/iframe.html?id=ledger-v4-per-account-view--hdfc-diners-black&viewMode=story'
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

// Check if expanded source pane has bg + border
const pane = await page.evaluate(() => {
  const el = document.querySelector('.cm-editor')
  if (!el) return { found: false }
  const wrapper = el.closest('div[class*="ml-"]') || el.parentElement
  const w = window.getComputedStyle(wrapper)
  // Find which CSS rules apply ml/p
  const sheets = Array.from(document.styleSheets)
  const mlRules = []
  const p5Rules = []
  for (const s of sheets) {
    let rules
    try { rules = s.cssRules } catch { continue }
    for (const r of rules || []) {
      if (r.cssText && (r.cssText.includes('ml-\\[56px\\]') || r.cssText.includes('.ml-\\[56'))) mlRules.push(r.cssText.slice(0,200))
      if (r.cssText && r.cssText.includes('.p-5')) p5Rules.push(r.cssText.slice(0,200))
      if (r.cssText && r.cssText.includes('w-\\[64px\\]')) mlRules.push('W64:'+r.cssText.slice(0,100))
      if (r.cssText && r.cssText.includes('w-\\[360px\\]')) mlRules.push('W360:'+r.cssText.slice(0,100))
      if (r.cssText && r.cssText.includes('h-\\[40px\\]')) mlRules.push('H40:'+r.cssText.slice(0,100))
    }
  }
  return {
    found: true,
    cls: wrapper?.className,
    ml: w.marginLeft, mr: w.marginRight, mb: w.marginBottom,
    bg: w.backgroundColor, border: w.borderTop, padding: w.padding,
    mlRulesCount: mlRules.length,
    mlRules: mlRules.slice(0, 3),
    p5RulesCount: p5Rules.length,
    p5Rules: p5Rules.slice(0, 3),
  }
})
console.log('source pane:', JSON.stringify(pane, null, 2))

// Check Save button visibility
const save = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'))
  const s = btns.find(b => b.textContent?.includes('Save'))
  if (!s) return { found: false }
  const r = s.getBoundingClientRect()
  return { found: true, x: r.x, y: r.y, w: r.width, h: r.height, html: s.outerHTML.slice(0, 200) }
})
console.log('save btn:', JSON.stringify(save, null, 2))

await browser.close()

import { chromium } from '@playwright/test'
import { resolve } from 'node:path'

const browser = await chromium.launch()

async function check(label, url, isFile) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(isFile ? 'file://' + resolve(url) : url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const data = await page.evaluate(() => {
    const labels = ['Accounts', 'Pinned', 'HDFC Diners Black', 'ICICI Savings', 'Recent', 'Amazon Pay', 'All Accounts', 'Bank & Cash', 'HDFC Salary', '+ Add account', 'Net Worth']
    const all = Array.from(document.querySelectorAll('*'))
    return labels.map((t) => {
      const el = all.find((e) => e.textContent?.trim() === t && e.children.length === 0)
      if (!el) return { t, missing: true }
      const cs = getComputedStyle(el)
      return { t, color: cs.color, fw: cs.fontWeight, fs: cs.fontSize, ts: cs.fontFeatureSettings, smoothing: cs.webkitFontSmoothing }
    })
  })
  console.log(`\n=== ${label} ===`)
  for (const d of data) {
    if (d.missing) { console.log(`${d.t}: MISSING`); continue }
    console.log(`${d.t.padEnd(20)} c=${d.color} fw=${d.fw} fs=${d.fs} smooth=${d.smoothing}`)
  }
  await ctx.close()
}

await check('STITCH', '/tmp/nav-option-2.html', true)
await check('HOME', 'http://localhost:6006/iframe.html?id=home-chrome--stitch-parity&viewMode=story', false)
await browser.close()

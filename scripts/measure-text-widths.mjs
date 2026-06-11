import { chromium } from '@playwright/test'
import { resolve } from 'node:path'

const STITCH_HTML = '/tmp/nav-option-2.html'
const STORYBOOK_URL = process.env.STORYBOOK_URL ?? 'http://localhost:6006'
const VIEW = { width: 1440, height: 900 }

const browser = await chromium.launch()

async function inspect(label, url) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const data = await page.evaluate(() => {
    const labels = ['Accounts', 'Pinned', 'HDFC Diners Black', '-₹47,820', 'ICICI Savings', '₹1,24,500', 'Axis Forex', '$2,450', 'Recent', 'Amazon Pay', '₹4,200', '2h', 'All Accounts', 'Net Worth', '₹2,33,820', '+ Add account']
    const all = Array.from(document.querySelectorAll('*'))
    return labels.map((t) => {
      const el = all.find((e) => e.textContent?.trim() === t && e.children.length === 0)
      if (!el) return { t, missing: true }
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return { t, w: Math.round(r.width), h: Math.round(r.height), fs: cs.fontSize, fw: cs.fontWeight, ff: cs.fontFamily.split(',')[0] }
    })
  })
  console.log(`\n=== ${label} ===`)
  for (const d of data) {
    if (d.missing) { console.log(`${d.t}: MISSING`); continue }
    console.log(`${d.t.padEnd(20)} w=${String(d.w).padStart(4)} h=${String(d.h).padStart(2)} fs=${d.fs} fw=${d.fw} ff=${d.ff}`)
  }
  await ctx.close()
}

await inspect('STITCH', 'file://' + resolve(STITCH_HTML))
await inspect('HOME', `${STORYBOOK_URL}/iframe.html?id=home-chrome--stitch-parity&viewMode=story`)
await browser.close()

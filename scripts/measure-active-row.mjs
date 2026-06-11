import { chromium } from '@playwright/test'
import { resolve } from 'node:path'

const STITCH_HTML = '/tmp/nav-option-2.html'
const STORYBOOK_URL = process.env.STORYBOOK_URL ?? 'http://localhost:6006'
const VIEW = { width: 1440, height: 900 }

const browser = await chromium.launch()

async function inspect(label, url, isFile) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.goto(isFile ? 'file://' + resolve(url) : url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const data = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'))
    const findAncestor = (text, predicate) => {
      const el = all.find((e) => e.textContent?.trim() === text && e.children.length === 0)
      if (!el) return null
      let p = el
      while (p && !predicate(p)) p = p.parentElement
      return p
    }
    const activeRow = findAncestor('HDFC Diners Black', (e) => e.className?.includes?.('bg-teal-50') && e.className?.includes?.('border-r'))
    const rect = (e) => {
      if (!e) return null
      const r = e.getBoundingClientRect()
      const cs = getComputedStyle(e)
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bg: cs.backgroundColor, br: cs.borderRightColor + ' ' + cs.borderRightWidth, font: cs.fontFamily.split(',')[0], pl: cs.paddingLeft, pr: cs.paddingRight, pt: cs.paddingTop, pb: cs.paddingBottom }
    }
    const findActiveIcon = () => {
      const span = all.find((e) => e.tagName === 'SPAN' && e.textContent?.trim() === 'account_balance' && e.parentElement?.className?.includes?.('bg-teal-50'))
      return span?.parentElement
    }
    const aside = document.querySelector('aside')
    return {
      activeRow: rect(activeRow),
      activeIcon: rect(findActiveIcon()),
      pane: rect(aside),
      iconRail: rect(document.querySelector('nav')),
    }
  })
  console.log(`\n=== ${label} ===`)
  for (const [k, v] of Object.entries(data)) {
    if (!v) { console.log(`${k}: null`); continue }
    console.log(`${k.padEnd(12)} x=${String(v.x).padStart(4)} y=${String(v.y).padStart(4)} w=${String(v.w).padStart(4)} h=${String(v.h).padStart(3)} bg=${v.bg} br=${v.br}`)
  }
  await ctx.close()
}

await inspect('STITCH', STITCH_HTML, true)
await inspect('HOME', `${STORYBOOK_URL}/iframe.html?id=home-chrome--stitch-parity&viewMode=story`, false)
await browser.close()

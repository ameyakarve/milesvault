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
    const icons = document.querySelectorAll('.material-symbols-outlined')
    return Array.from(icons).slice(0, 25).map((el) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return {
        text: el.textContent.trim(),
        h: Math.round(r.height),
        w: Math.round(r.width),
        fs: cs.fontSize,
        lh: cs.lineHeight,
        ff: cs.fontFamily,
        fvs: cs.fontVariationSettings,
        display: cs.display,
      }
    })
  })
  console.log(`\n=== ${label} ===`)
  for (const i of data) {
    console.log(`${i.text.padEnd(20)} ${String(i.w)+'x'+String(i.h)} fs=${i.fs} lh=${i.lh} d=${i.display} ff=${i.ff.split(',')[0]} fvs=${i.fvs}`)
  }
  await ctx.close()
}

await inspect('STITCH', 'file://' + resolve(STITCH_HTML))
await inspect('HOME', `${STORYBOOK_URL}/iframe.html?id=home-chrome--stitch-parity&viewMode=story`)
await browser.close()

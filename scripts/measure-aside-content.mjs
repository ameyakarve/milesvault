import { chromium } from '@playwright/test'

const W = 1280
const H = 820
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })

async function probe(url, waitSel) {
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: 'networkidle' })
  if (waitSel) await page.waitForSelector(waitSel, { timeout: 30000 })
  await page.waitForTimeout(1500)
  const data = await page.evaluate(() => {
    const round = (n) => Math.round(n * 10) / 10
    const ph = (el, label) => {
      if (!el) return { _label: label, missing: true }
      const r = el.getBoundingClientRect()
      return { _label: label, x: round(r.left), y: round(r.top), w: round(r.width), h: round(r.height) }
    }
    const aside = Array.from(document.querySelectorAll('aside')).find((a) =>
      a.textContent && a.textContent.includes('AI Manuscript Assistant'),
    )
    const title = aside?.querySelector('h2')
    const intro = aside?.querySelector('p')
    const buttons = Array.from(aside?.querySelectorAll('button[class*="text-[11px]"]') || [])
    const textarea = aside?.querySelector('textarea')
    return [
      ph(aside, 'aside'),
      ph(title, 'title'),
      ph(intro, 'intro'),
      ...buttons.map((b, i) => ph(b, `prompt[${i}]`)),
      ph(textarea, 'textarea'),
    ]
  })
  await page.close()
  return data
}

const ref = await probe('http://localhost:7700/refined.html', null)
const mine = await probe(
  'http://localhost:6006/iframe.html?id=ledger-notebook-view--default&viewMode=story&_=' + Date.now(),
  '.cm-content',
)

console.log('   LABEL          REF y/h           MINE y/h')
for (let i = 0; i < Math.max(ref.length, mine.length); i++) {
  const r = ref[i] || {}
  const m = mine[i] || {}
  console.log(
    `  ${(r._label || m._label || '').padEnd(14)} ${(r.y ?? '?')}/${(r.h ?? '?')}  ${(m.y ?? '?')}/${(m.h ?? '?')}  Δy=${(m.y ?? 0) - (r.y ?? 0)}`,
  )
}
await browser.close()

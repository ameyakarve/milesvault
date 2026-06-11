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
    const ph = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: round(r.left), y: round(r.top), w: round(r.width), h: round(r.height) }
    }
    const navRail = document.querySelector('aside.fixed.left-0, aside.w-12, aside[class*="left-0"]')
    const aside = Array.from(document.querySelectorAll('aside')).find((a) =>
      a.textContent && a.textContent.includes('AI Manuscript Assistant'),
    )
    const header = document.querySelector('header, .h-12.bg-white')
    const account = Array.from(document.querySelectorAll('section, .h-16'))[0]
    const status = document.querySelector('footer')
    return {
      navRail: ph(navRail),
      asideAi: ph(aside),
      header: ph(header),
      accountStrip: ph(account),
      footer: ph(status),
    }
  })
  await page.close()
  return data
}

const ref = await probe('http://localhost:7700/refined.html', null)
const mine = await probe(
  'http://localhost:6006/iframe.html?id=ledger-notebook-view--default&viewMode=story&_=' + Date.now(),
  '.cm-content',
)
console.log('REF', JSON.stringify(ref, null, 2))
console.log('MINE', JSON.stringify(mine, null, 2))
await browser.close()

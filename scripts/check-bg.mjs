import { chromium } from '@playwright/test'

const STORYBOOK_URL = process.env.STORYBOOK_URL ?? 'http://localhost:6006'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto(`${STORYBOOK_URL}/iframe.html?id=home-chrome--stitch-parity&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)

const data = await page.evaluate(() => {
  const outer = document.querySelector('div.bg-background')
  const aside = document.querySelector('aside')
  const main = document.querySelector('main')
  const header = document.querySelector('header')
  const filterInput = document.querySelector('input[placeholder="Filter accounts..."]')
  const search = document.querySelector('div.flex.items-center.gap-1.text-\\[11px\\]')
  function info(el) {
    if (!el) return 'null'
    const cs = getComputedStyle(el)
    return { bg: cs.backgroundColor, br: cs.borderRightColor, classes: el.className?.toString?.()?.slice?.(0, 200) }
  }
  return {
    outer: info(outer),
    aside: info(aside),
    main: info(main),
    header: info(header),
    filterInput: info(filterInput),
    search: info(search),
  }
})
console.log(JSON.stringify(data, null, 2))
await browser.close()

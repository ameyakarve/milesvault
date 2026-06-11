import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1474 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto('http://localhost:6006/iframe.html?id=ledgernew-shell--stitch-v-5&viewMode=story', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.cm-content', { timeout: 15000 })
await page.waitForTimeout(1500)
const bg = await page.evaluate(() => {
  const main = document.querySelector('main')
  const body = document.body
  const html = document.documentElement
  return {
    bodyBg: getComputedStyle(body).backgroundColor,
    htmlBg: getComputedStyle(html).backgroundColor,
    mainBg: main ? getComputedStyle(main).backgroundColor : null,
    mainCls: main ? main.className : null,
    storybookRoot: document.getElementById('storybook-root') ? getComputedStyle(document.getElementById('storybook-root')).backgroundColor : null,
  }
})
console.log(JSON.stringify(bg, null, 2))
await browser.close()

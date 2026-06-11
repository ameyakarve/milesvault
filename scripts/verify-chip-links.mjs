import { chromium } from '@playwright/test'
const URL = 'http://localhost:6006/iframe.html?id=ledger-per-account-view-fixture--prefix-scope&viewMode=story'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('.cm-content', { timeout: 8000 })
const links = await page.evaluate(() =>
  Array.from(document.querySelectorAll('a.rounded-full')).map((a) => ({
    text: a.textContent?.trim(),
    href: a.getAttribute('href'),
  })),
)
console.log(JSON.stringify(links, null, 2))
await browser.close()

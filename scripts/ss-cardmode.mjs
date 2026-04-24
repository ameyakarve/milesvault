import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto('http://localhost:6006/iframe.html?id=ledgernew-editor--card-mode&viewMode=story&_=' + Date.now(), { waitUntil: 'networkidle' })
await page.waitForSelector('.cm-content', { timeout: 15000 })
await page.waitForTimeout(1500)
await page.screenshot({ path: '/tmp/ss-cardmode.png', fullPage: false })
await browser.close()
console.log('ok')

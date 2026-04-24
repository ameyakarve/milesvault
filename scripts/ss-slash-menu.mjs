import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto('http://localhost:6006/iframe.html?id=ledgernew-editor--empty&viewMode=story&_=' + Date.now(), { waitUntil: 'networkidle' })
await page.waitForSelector('.cm-content', { timeout: 15000 })
await page.waitForTimeout(500)
await page.click('.cm-content')
await page.keyboard.type('/')
await page.waitForTimeout(400)
await page.screenshot({ path: '/tmp/ss-slash-menu.png', fullPage: false })
await browser.close()
console.log('ok')

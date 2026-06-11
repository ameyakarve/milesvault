import { chromium } from '@playwright/test'
const TOKEN = process.env.TEST_USER_TOKEN
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
await ctx.addCookies([{ name: 'mv-test-token', value: encodeURIComponent(TOKEN), url: 'https://staging.milesvault.com' }])
const page = await ctx.newPage()
await page.goto('https://staging.milesvault.com/editor', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await page.screenshot({ path: '/tmp/editor-toolbar.png' })
await browser.close()

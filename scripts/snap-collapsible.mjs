import { chromium } from '@playwright/test'
import { resolve } from 'node:path'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 3000, height: 2200 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
await page.goto('file://' + resolve('/tmp/nav-collapse-button-v1.html'), { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(800)
await page.screenshot({ path: '/tmp/nav-collapse-button-v1-full.png', fullPage: true })
await browser.close()

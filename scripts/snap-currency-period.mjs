import { chromium } from '@playwright/test'

const URL = 'http://localhost:6006/iframe.html?id=ledger-per-account-view-fixture--default&viewMode=story'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const buf = await page.screenshot({ clip: { x: 48, y: 0, width: 1100, height: 110 } })
import('node:fs').then((fs) => fs.writeFileSync('/tmp/breadcrumb-stats.png', buf))
console.log('snapped /tmp/breadcrumb-stats.png')
await browser.close()

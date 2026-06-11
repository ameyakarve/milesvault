import { chromium } from '@playwright/test'

const URL = 'http://localhost:6006/iframe.html?id=ledger-per-account-view-fixture--statement&viewMode=story'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('.cm-content', { timeout: 8000 })

// Crop rows 2 (closed) through row 5 (Apple Store, closed) — showing both kinds adjacent
const buf = await page.screenshot({ clip: { x: 48, y: 200, width: 1100, height: 360 } })
import('node:fs').then(fs => fs.writeFileSync('/tmp/statement-rows-crop.png', buf))
console.log('cropped /tmp/statement-rows-crop.png')

await browser.close()

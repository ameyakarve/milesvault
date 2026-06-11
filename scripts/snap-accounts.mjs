import { chromium } from '@playwright/test'

const URL = 'http://localhost:6006/iframe.html?id=accounts-directory-fixture--default&viewMode=story'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

const buf = await page.screenshot({ fullPage: false })
import('node:fs').then((fs) => fs.writeFileSync('/tmp/accounts-fixture.png', buf))
console.log('snapped /tmp/accounts-fixture.png')
await browser.close()

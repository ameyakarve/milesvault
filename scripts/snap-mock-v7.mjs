import { chromium } from '@playwright/test'
import { pathToFileURL } from 'node:url'

const URL = pathToFileURL('/tmp/stitch/accounts-v7.html').toString()
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const buf = await page.screenshot({ fullPage: false })
import('node:fs').then((fs) => fs.writeFileSync('/tmp/mock-v7-rendered.png', buf))
console.log('snapped /tmp/mock-v7-rendered.png')
await browser.close()

import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 2 })
const url = 'http://localhost:6006/iframe.html?id=ledger-v4-per-account-view--hdfc-diners-black&viewMode=story'
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.screenshot({ path: '/tmp/per-account-shot.png', fullPage: true })
console.log('errors:', errors.length)
errors.forEach((e) => console.log(e))
await browser.close()

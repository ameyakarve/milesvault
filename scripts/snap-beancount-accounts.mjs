import { chromium } from '@playwright/test'

const URL = 'https://beancount.io/ledger/open_ledger/example/accounts'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(3000)
await page.screenshot({ path: '/tmp/beancount-accounts-full.png', fullPage: true })
await page.screenshot({ path: '/tmp/beancount-accounts-fold.png', clip: { x: 0, y: 0, width: 1440, height: 1200 } })
const html = await page.content()
import('node:fs').then((fs) => fs.writeFileSync('/tmp/beancount-accounts.html', html))
console.log('saved /tmp/beancount-accounts-full.png, /tmp/beancount-accounts-fold.png, /tmp/beancount-accounts.html')
await browser.close()

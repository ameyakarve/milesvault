import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'

const PORT = process.env.STORYBOOK_PORT || '6006'
const URL = `http://localhost:${PORT}/iframe.html?id=ledger-per-account-view-fixture--default&viewMode=story`

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const res = await page.goto(URL, { waitUntil: 'networkidle' })
if (!res || !res.ok()) throw new Error(`failed ${URL}: ${res?.status()}`)

await page.waitForSelector('.cm-content', { timeout: 8000 })
await page.waitForFunction(() => document.querySelectorAll('.cm-card-bg').length >= 3, { timeout: 8000 })

const buf = await page.screenshot({ fullPage: false })
writeFileSync('/tmp/fixture-v8.png', buf)
console.log('snapped /tmp/fixture-v8.png')

await browser.close()

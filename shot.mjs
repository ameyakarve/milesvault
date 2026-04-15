import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const STORIES = [
  'empty',
  'cc-spend',
  'cc-spend-reward',
  'cc-spend-discount',
  'cc-spend-cashback',
  'cc-spend-kitchen-sink',
  'cash-spend',
  'split-expense',
  'pending-txn',
  'multiple-txns',
  'orphan-cashback-income',
  'orphan-reward-asset',
  'hotel-with-redemption',
  'orphan-redemption-no-price',
  'points-transfer-basic',
  'points-transfer-no-price',
  'transfer-basic',
  'cc-payment',
  'wallet-top-up',
  'gift-card-top-up',
  'cc-refund',
  'annual-fee',
  'server-rejects',
]

const OUT_DIR = '/tmp/txnnewcard-shots'
mkdirSync(OUT_DIR, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 760, height: 1200 }, deviceScaleFactor: 2 })

for (const id of STORIES) {
  const url = `http://localhost:6006/iframe.html?id=chat-txnnewcard--${id}&viewMode=story`
  try {
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    const target = (await page.$('.txn-card')) || (await page.$('#storybook-root'))
    const out = `${OUT_DIR}/${id}.png`
    await target.screenshot({ path: out })
    console.log('OK', id)
  } catch (e) {
    console.log('ERR', id, e.message)
  }
}
await browser.close()

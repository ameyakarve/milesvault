import { chromium } from '@playwright/test'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import fs from 'node:fs'

const W = 1280
const H = 820
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })

async function shoot(url, path, waitSel) {
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: 'networkidle' })
  if (waitSel) await page.waitForSelector(waitSel, { timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path, fullPage: false, clip: { x: 0, y: 0, width: W, height: H } })
  await page.close()
}

await shoot('http://localhost:7700/refined.html', '/tmp/ref.png', null)
await shoot(
  'http://localhost:6006/iframe.html?id=ledger-notebook-view--default&viewMode=story&_=' + Date.now(),
  '/tmp/mine.png',
  '.cm-content',
)

const ref = PNG.sync.read(fs.readFileSync('/tmp/ref.png'))
const mine = PNG.sync.read(fs.readFileSync('/tmp/mine.png'))
const diff = new PNG({ width: W, height: H })
const n = pixelmatch(ref.data, mine.data, diff.data, W, H, { threshold: 0.1 })
fs.writeFileSync('/tmp/diff.png', PNG.sync.write(diff))
const total = W * H
console.log(`pixels=${n}/${total} (${((n / total) * 100).toFixed(2)}%)`)
await browser.close()

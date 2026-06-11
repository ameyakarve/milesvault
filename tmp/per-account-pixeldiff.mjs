import { chromium } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { writeFileSync, readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

const browser = await chromium.launch()

async function shot(url, out) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 1 })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1440, height: 1024 } })
  await page.close()
}

const v11Url = pathToFileURL('/Users/vandanakarve/milesvault/tmp/stitch/per-account-v11.html').href
const sbUrl = 'http://localhost:6006/iframe.html?id=ledger-v4-per-account-view--hdfc-diners-black&viewMode=story'

await shot(v11Url, '/tmp/v11.png')
await shot(sbUrl, '/tmp/sb.png')
await browser.close()

const a = PNG.sync.read(readFileSync('/tmp/v11.png'))
const b = PNG.sync.read(readFileSync('/tmp/sb.png'))
const { width, height } = a
const out = new PNG({ width, height })

const diff = pixelmatch(a.data, b.data, out.data, width, height, { threshold: 0.1, includeAA: false })
const total = width * height
console.log(`Different pixels: ${diff} / ${total}  (${(diff*100/total).toFixed(2)}%)`)

writeFileSync('/tmp/diff.png', PNG.sync.write(out))
// region-wise diff: split into 8 horizontal bands
const bands = 8
const bandH = Math.floor(height / bands)
for (let bi = 0; bi < bands; bi++) {
  let bcount = 0
  for (let y = bi*bandH; y < (bi+1)*bandH; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y*width + x) * 4
      const dr = Math.abs(a.data[i] - b.data[i])
      const dg = Math.abs(a.data[i+1] - b.data[i+1])
      const db = Math.abs(a.data[i+2] - b.data[i+2])
      if (dr+dg+db > 30) bcount++
    }
  }
  console.log(`band ${bi} y=${bi*bandH}-${(bi+1)*bandH}: ${bcount} diff px (${(bcount*100/(width*bandH)).toFixed(1)}%)`)
}

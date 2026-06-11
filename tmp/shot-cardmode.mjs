import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT_DIR = '/tmp/cardmode-shots'
mkdirSync(OUT_DIR, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 1400 }, deviceScaleFactor: 2 })

const stories = [
  { id: 'ledgernew-editor--card-mode', name: 'card-mode' },
  { id: 'ledgernew-editor--kitchen-sink', name: 'kitchen-sink' },
]

const logs = []
page.on('pageerror', (e) => logs.push(`PAGEERR: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') logs.push(`CONSOLE: ${m.text()}`)
})

for (const s of stories) {
  const url = `http://localhost:6006/iframe.html?id=${s.id}&viewMode=story`
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForTimeout(1200)
    const target = (await page.$('#storybook-root')) || (await page.$('body'))
    const out = `${OUT_DIR}/${s.name}.png`
    await target.screenshot({ path: out })
    console.log('OK', s.name, out)
  } catch (e) {
    console.log('ERR', s.name, e.message)
  }
}

for (const l of logs) console.log(l)
await browser.close()

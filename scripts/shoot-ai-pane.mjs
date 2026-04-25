import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const PORT = 6009
const STORIES = [
  ['ledgernew-aipane--empty', 'empty'],
  ['ledgernew-aipane--with-messages', 'with-messages'],
  ['ledgernew-aipane--thinking', 'thinking'],
  ['ledgernew-aipane--working', 'working'],
  ['ledgernew-aipane--error-state', 'error-state'],
  ['ledgernew-aipane--saving', 'saving'],
  ['ledgernew-twopane--default', 'twopane-default'],
]
const OUT = '/tmp/ai-pane-shots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } })
const page = await ctx.newPage()

for (const [id, name] of STORIES) {
  const url = `http://localhost:${PORT}/iframe.html?id=${id}&viewMode=story`
  await page.goto(url, { waitUntil: 'load', timeout: 30000 })
  await page.waitForTimeout(1500)
  const out = `${OUT}/${name}.png`
  await page.screenshot({ path: out, fullPage: false })
  console.log(`shot ${name} -> ${out}`)
}

await browser.close()

import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

const PORT = process.env.STORYBOOK_PORT || '6006'
const URL = `http://localhost:${PORT}/iframe.html?id=ledger-per-account-view-fixture--default&viewMode=story`

// rgba(0, 104, 95, 0.2) over white text/page should produce a pale teal:
// blend = 0.2 * (0,104,95) + 0.8 * (255,255,255) ≈ (204, 224, 223)
// Allow generous tolerance since text glyphs darken some pixels.
function isTealTinted(r, g, b) {
  // tinted-teal heuristic: greenish-blue, not pure white, not pure black,
  // green roughly equal to or slightly above blue, both above red
  if (r > 235 && g > 235 && b > 235) return false // white
  if (r < 60 && g < 60 && b < 60) return false // text glyphs
  return g >= r && b >= r && g - r > 5 && Math.abs(g - b) < 30 && g > 150
}

async function main() {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('.cm-content', { timeout: 10000 })
  await page.waitForFunction(
    () => document.querySelectorAll('.cm-line').length > 5,
    null,
    { timeout: 8000 },
  )

  const target = await page.evaluate(() => {
    const lines = Array.from(document.querySelectorAll('.cm-line.cm-card-mid'))
    for (const l of lines) {
      const txt = (l.textContent || '').trim()
      if (txt.length > 4) {
        const r = l.getBoundingClientRect()
        return { x: r.left, y: r.top, w: r.width, h: r.height, text: txt }
      }
    }
    return null
  })
  if (!target) throw new Error('no cm-line.cm-card-mid found')
  console.log('target:', target)

  const yMid = Math.round(target.y + target.h / 2)
  const xStart = Math.round(target.x + 10)
  const xEnd = Math.round(target.x + Math.min(target.w - 10, 250))
  await page.mouse.move(xStart, yMid)
  await page.mouse.down()
  await page.mouse.move(xEnd, yMid, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(150)

  // Get the actual painted selection rect
  const selRect = await page.evaluate(() => {
    const s = document.querySelector('.cm-selectionBackground')
    if (!s) return null
    const r = s.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  })
  console.log('selRect:', selRect)
  if (!selRect || selRect.w < 10 || selRect.h < 5) {
    throw new Error(
      `no usable .cm-selectionBackground (got ${JSON.stringify(selRect)})`,
    )
  }

  fs.mkdirSync('/tmp/sel', { recursive: true })
  const fullPath = '/tmp/sel/selection-full.png'
  await page.screenshot({ path: fullPath, fullPage: false })

  // Crop to the selection rect (pad +2)
  const cropPath = '/tmp/sel/selection-crop.png'
  const clip = {
    x: Math.max(0, Math.floor(selRect.x - 2)),
    y: Math.max(0, Math.floor(selRect.y - 2)),
    width: Math.ceil(selRect.w + 4),
    height: Math.ceil(selRect.h + 4),
  }
  await page.screenshot({ path: cropPath, clip })

  // Read PNG and scan pixels
  const buf = fs.readFileSync(cropPath)
  const png = PNG.sync.read(buf)
  let total = 0
  let teal = 0
  let textPx = 0
  let whitePx = 0
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const idx = (png.width * y + x) << 2
      const r = png.data[idx]
      const g = png.data[idx + 1]
      const b = png.data[idx + 2]
      total++
      if (isTealTinted(r, g, b)) teal++
      else if (r < 60 && g < 60 && b < 60) textPx++
      else if (r > 235 && g > 235 && b > 235) whitePx++
    }
  }
  const pct = (teal / total) * 100
  console.log(
    `pixel scan inside selection rect: total=${total} teal=${teal} (${pct.toFixed(1)}%) text=${textPx} white=${whitePx}`,
  )

  // Also sample a baseline INSIDE the same line but OUTSIDE the selection rect
  // (right edge): should be near-white if selection painted only over selection range.
  const baseline = await page.evaluate((sel) => {
    const line = Array.from(document.querySelectorAll('.cm-line.cm-card-mid')).find(
      (l) => (l.textContent || '').includes('Cashback'),
    )
    if (!line) return null
    const r = line.getBoundingClientRect()
    return {
      x: Math.max(0, Math.floor(sel.x + sel.w + 20)),
      y: Math.floor(r.top + 4),
      width: 60,
      height: Math.max(8, Math.floor(r.height - 8)),
    }
  }, selRect)
  if (baseline && baseline.width > 0 && baseline.height > 0) {
    const baselinePath = '/tmp/sel/baseline-crop.png'
    await page.screenshot({ path: baselinePath, clip: baseline })
    const bbuf = fs.readFileSync(baselinePath)
    const bpng = PNG.sync.read(bbuf)
    let btotal = 0
    let bteal = 0
    for (let y = 0; y < bpng.height; y++) {
      for (let x = 0; x < bpng.width; x++) {
        const idx = (bpng.width * y + x) << 2
        const r = bpng.data[idx]
        const g = bpng.data[idx + 1]
        const b = bpng.data[idx + 2]
        btotal++
        if (isTealTinted(r, g, b)) bteal++
      }
    }
    console.log(
      `baseline (outside selection on same line): total=${btotal} teal=${bteal} (${((bteal / btotal) * 100).toFixed(1)}%)`,
    )
  }

  await browser.close()

  if (pct < 5) {
    console.error(`FAIL: <5% teal pixels inside selection rect — selection bg not visible`)
    process.exit(1)
  }
  console.log('PASS: selection background visibly painted')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

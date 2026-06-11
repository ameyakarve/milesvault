import { chromium } from '@playwright/test'
import fs from 'node:fs'

const PORT = process.env.STORYBOOK_PORT || '6006'
const URL = `http://localhost:${PORT}/iframe.html?id=ledger-per-account-view-fixture--default&viewMode=story`

const TEAL = { r: 0, g: 104, b: 95 } // #00685f
const TEAL_TOL = 60 // be generous — semi-transparent teal blended over white/anything

function isTealish(px) {
  const [r, g, b] = px
  // teal-ish: g > r, b near g, both > r
  return g - r > 20 && Math.abs(g - b) < 40 && g > 70 && r < 200
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

  // Find a cm-line that is *inside* a card (cm-card-mid or top), so it has the
  // white card bg painting over it — that's the failure case.
  const target = await page.evaluate(() => {
    const lines = Array.from(document.querySelectorAll('.cm-line.cm-card-mid'))
    if (!lines.length) return null
    // pick one with visible text (not blank)
    for (const l of lines) {
      const txt = (l.textContent || '').trim()
      if (txt.length > 4) {
        const r = l.getBoundingClientRect()
        return { x: r.left, y: r.top, w: r.width, h: r.height, text: txt }
      }
    }
    return null
  })
  if (!target) {
    console.error('no cm-line.cm-card-mid found — fixture may have changed')
    await browser.close()
    process.exit(2)
  }
  console.log('target line:', target)

  // Drag-select across the line: from x+10 to x+200 (or width-10), at vertical center
  const yMid = Math.round(target.y + target.h / 2)
  const xStart = Math.round(target.x + 10)
  const xEnd = Math.round(target.x + Math.min(target.w - 10, 250))
  await page.mouse.move(xStart, yMid)
  await page.mouse.down()
  await page.mouse.move(xEnd, yMid, { steps: 10 })
  await page.mouse.up()

  // Wait a beat for paint
  await page.waitForTimeout(150)

  // Probe: is there a .cm-selectionBackground rect at this location?
  const probe = await page.evaluate((y) => {
    const sels = Array.from(document.querySelectorAll('.cm-selectionBackground'))
    const layer = document.querySelector('.cm-selectionLayer')
    const layerCS = layer ? getComputedStyle(layer) : null
    const lineSample = document.querySelector('.cm-line.cm-card-mid')
    const lineCS = lineSample ? getComputedStyle(lineSample) : null
    const contentCS = document.querySelector('.cm-content')
      ? getComputedStyle(document.querySelector('.cm-content'))
      : null
    return {
      selBgCount: sels.length,
      selBgRects: sels.map((s) => {
        const r = s.getBoundingClientRect()
        const cs = getComputedStyle(s)
        return {
          x: Math.round(r.left),
          y: Math.round(r.top),
          w: Math.round(r.width),
          h: Math.round(r.height),
          background: cs.backgroundColor,
        }
      }),
      layer: layer
        ? {
            zIndex: layerCS.zIndex,
            position: layerCS.position,
            cls: layer.className,
          }
        : null,
      line: lineCS
        ? {
            zIndex: lineCS.zIndex,
            position: lineCS.position,
            background: lineCS.backgroundColor,
          }
        : null,
      content: contentCS
        ? { zIndex: contentCS.zIndex, position: contentCS.position }
        : null,
      // window selection text
      windowSelText: window.getSelection()?.toString() || '',
    }
  }, yMid)
  console.log('probe:', JSON.stringify(probe, null, 2))

  // Screenshot the line region for visual proof
  const clip = {
    x: Math.max(0, target.x - 5),
    y: Math.max(0, target.y - 5),
    width: Math.min(1440 - target.x + 5, target.w + 10),
    height: target.h + 10,
  }
  fs.mkdirSync('/tmp/sel', { recursive: true })
  await page.screenshot({ path: '/tmp/sel/selection-line.png', clip })
  await page.screenshot({ path: '/tmp/sel/selection-full.png' })

  // Pixel scan inside the selection rect on the screenshot
  // Read raw pixels via a canvas eval
  const tealHits = await page.evaluate(
    ({ clip, yMid, xStart, xEnd }) => {
      // Use the actual page, scan the band from xStart..xEnd at yMid ± 6
      // by sampling document via html2canvas would be heavy; instead just
      // report whether the .cm-selectionBackground rect's *visible* bg is a
      // teal-ish color (it's the easiest meaningful check).
      const layer = document.querySelector('.cm-selectionLayer')
      const sels = Array.from(document.querySelectorAll('.cm-selectionBackground'))
      const samples = sels.map((s) => {
        const r = s.getBoundingClientRect()
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        // What's painted at (cx, cy)? Use elementsFromPoint to walk top-down
        const stack = document.elementsFromPoint(cx, cy)
        return {
          stackTop: stack[0] ? stack[0].className || stack[0].tagName : null,
          stack: stack.slice(0, 6).map((e) => e.className || e.tagName),
          rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
        }
      })
      return { samples }
    },
    { clip, yMid, xStart, xEnd },
  )
  console.log('hit-test at selection rects:', JSON.stringify(tealHits, null, 2))

  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

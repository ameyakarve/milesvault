import { chromium } from '@playwright/test'
import fs from 'node:fs'
import { PNG } from 'pngjs'

const PORT = process.env.STORYBOOK_PORT || '6006'
const URL = `http://localhost:${PORT}/iframe.html?id=ledger-per-account-view-fixture--default&viewMode=story`

function isTealTinted(r, g, b) {
  if (r > 235 && g > 235 && b > 235) return false
  if (r < 60 && g < 60 && b < 60) return false
  return g >= r && b >= r && g - r > 5 && Math.abs(g - b) < 30 && g > 150
}

async function main() {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errors = []

  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('.cm-content', { timeout: 10000 })
  await page.waitForFunction(
    () => document.querySelectorAll('.cm-line.cm-card-mid').length > 0,
    null,
    { timeout: 8000 },
  )

  // 1. cm-line (with cm-card-* class) must be transparent now
  const lineBg = await page.evaluate(() => {
    const l = document.querySelector('.cm-line.cm-card-mid')
    return getComputedStyle(l).backgroundColor
  })
  console.log('cm-line.cm-card-mid bg:', lineBg)
  if (lineBg !== 'rgba(0, 0, 0, 0)') {
    errors.push(`cm-line should be transparent (got ${lineBg})`)
  }

  // 2. Custom layer + RectangleMarker DOM exists
  const layerInfo = await page.evaluate(() => {
    const l = document.querySelector('.cm-card-bg-layer')
    if (!l) return null
    const cs = getComputedStyle(l)
    const markers = l.querySelectorAll('.cm-card-bg')
    const markerInfo = Array.from(markers).slice(0, 2).map((m) => {
      const r = m.getBoundingClientRect()
      const ms = getComputedStyle(m)
      return {
        x: Math.round(r.left),
        y: Math.round(r.top),
        w: Math.round(r.width),
        h: Math.round(r.height),
        bg: ms.backgroundColor,
        border: ms.borderTopWidth + ' ' + ms.borderTopColor,
        radius: ms.borderTopLeftRadius,
        shadow: ms.boxShadow,
      }
    })
    const sel = document.querySelector('.cm-selectionLayer')
    return {
      layerZIndex: cs.zIndex,
      layerPointerEvents: cs.pointerEvents,
      markerCount: markers.length,
      markers: markerInfo,
      selectionLayerZIndex: sel ? getComputedStyle(sel).zIndex : null,
    }
  })
  console.log('layer info:', JSON.stringify(layerInfo, null, 2))
  if (!layerInfo) {
    errors.push('cm-card-bg-layer not found in DOM')
  } else {
    if (layerInfo.markerCount < 5) {
      errors.push(`expected >=5 .cm-card-bg markers, got ${layerInfo.markerCount}`)
    }
    if (layerInfo.layerPointerEvents !== 'none') {
      errors.push(`layer pointer-events should be none (got ${layerInfo.layerPointerEvents})`)
    }
    // Card layer z-index must be MORE NEGATIVE than selection layer
    const cardZ = parseInt(layerInfo.layerZIndex, 10)
    const selZ = parseInt(layerInfo.selectionLayerZIndex, 10)
    if (Number.isNaN(cardZ) || Number.isNaN(selZ) || cardZ >= selZ) {
      errors.push(
        `card layer z-index (${cardZ}) must be < selection layer z-index (${selZ})`,
      )
    }
    for (const m of layerInfo.markers) {
      if (m.bg !== 'rgb(255, 255, 255)') {
        errors.push(`card bg marker not white: ${m.bg}`)
        break
      }
      if (!m.border.includes('1px')) {
        errors.push(`card bg marker missing 1px border: ${m.border}`)
        break
      }
    }
  }

  // 3. Drag-select on a card-mid line and verify selection paints over text
  const target = await page.evaluate(() => {
    const lines = Array.from(document.querySelectorAll('.cm-line.cm-card-mid'))
    for (const l of lines) {
      const txt = (l.textContent || '').trim()
      if (txt.length > 4) {
        const r = l.getBoundingClientRect()
        return { x: r.left, y: r.top, w: r.width, h: r.height }
      }
    }
    return null
  })
  if (!target) throw new Error('no cm-line.cm-card-mid for selection test')
  const yMid = Math.round(target.y + target.h / 2)
  const xStart = Math.round(target.x + 10)
  const xEnd = Math.round(target.x + Math.min(target.w - 10, 250))
  await page.mouse.move(xStart, yMid)
  await page.mouse.down()
  await page.mouse.move(xEnd, yMid, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(150)

  const selRect = await page.evaluate(() => {
    const s = document.querySelector('.cm-selectionBackground')
    if (!s) return null
    const r = s.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  })
  if (!selRect || selRect.w < 10) {
    errors.push(`no usable selection rect (got ${JSON.stringify(selRect)})`)
  } else {
    fs.mkdirSync('/tmp/sel', { recursive: true })
    const cropPath = '/tmp/sel/layer-selection.png'
    await page.screenshot({
      path: cropPath,
      clip: {
        x: Math.max(0, Math.floor(selRect.x - 2)),
        y: Math.max(0, Math.floor(selRect.y - 2)),
        width: Math.ceil(selRect.w + 4),
        height: Math.ceil(selRect.h + 4),
      },
    })
    const png = PNG.sync.read(fs.readFileSync(cropPath))
    let total = 0
    let teal = 0
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        const idx = (png.width * y + x) << 2
        if (isTealTinted(png.data[idx], png.data[idx + 1], png.data[idx + 2])) teal++
        total++
      }
    }
    const pct = (teal / total) * 100
    console.log(`selection paint: ${teal}/${total} = ${pct.toFixed(1)}% teal-tinted`)
    if (pct < 5) errors.push(`selection bg not visible over text (only ${pct.toFixed(1)}% teal)`)
  }

  // 4. After Cmd+A, verify clicks reach cm-line (not blocked by any layer)
  await page.click('.cm-content')
  await page.keyboard.press('Meta+a')
  await page.waitForTimeout(150)
  const hitTest = await page.evaluate(() => {
    const line = document.querySelector('.cm-line.cm-card-mid')
    const r = line.getBoundingClientRect()
    const cx = r.left + 100
    const cy = r.top + 10
    const stack = document.elementsFromPoint(cx, cy).slice(0, 5).map((e) => e.className || e.tagName)
    return { stack, lineY: r.top }
  })
  console.log('after cmd+a, stack at line:', hitTest.stack)
  // The TOP of the stack (first element) must NOT be cm-card-bg or cm-selectionBackground —
  // it should be cm-line (or text inside it) so clicks reach the editor.
  const top = hitTest.stack[0]
  if (top === 'cm-card-bg' || top === 'cm-selectionBackground') {
    errors.push(`after cmd+a, click would hit '${top}' instead of cm-line — clicks blocked`)
  }

  // 5. Full-page screenshot for eyeball verification
  await page.mouse.click(10, 10) // deselect
  await page.waitForTimeout(100)
  await page.screenshot({ path: '/tmp/sel/cards-full.png', fullPage: false })
  console.log('full screenshot: /tmp/sel/cards-full.png')

  await browser.close()

  if (errors.length > 0) {
    console.error('VERIFY FAILED:')
    for (const e of errors) console.error('  -', e)
    process.exit(1)
  }
  console.log('VERIFY OK')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

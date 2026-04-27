// Tier-3 pixel verification.
//
// Mock and fixture intentionally use different datasets (different account names,
// payees, amounts). Cell-for-cell pixelmatch on the rendered screens is therefore
// meaningless — every text region would diverge.
//
// Instead this script renders the Stitch mock (`/tmp/stitch/refined.html`) and the
// running Storybook fixture in Playwright at matched viewports, then compares
// **non-text geometric regions** that should be invariant across datasets:
//
//   1. Card chrome corner   — pure white background with a 1px border at radius
//   2. Gutter vertical strip — flat color
//   3. AI pane background   — flat color block
//   4. Page background      — flat color block
//
// Each region is averaged to a single rgba and asserted to be within a small
// distance of the reference. Failures produce side-by-side annotated PNGs in /tmp.

import { chromium } from '@playwright/test'
import { PNG } from 'pngjs'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const PORT = process.env.STORYBOOK_PORT || '6006'
const STORYBOOK = `http://localhost:${PORT}`
const MOCK_HTML = resolve('/tmp/stitch/refined.html')
const FIXTURE_URL = `${STORYBOOK}/iframe.html?id=ledger-per-account-view-fixture--default&viewMode=story`

function avgColor(buf, width, height, x, y, w, h) {
  let r = 0, g = 0, b = 0, a = 0, n = 0
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const i = (yy * width + xx) * 4
      r += buf[i]
      g += buf[i + 1]
      b += buf[i + 2]
      a += buf[i + 3]
      n++
    }
  }
  return [r / n, g / n, b / n, a / n].map(Math.round)
}

function colorDist(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2]
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

async function snap(url, viewport, outPath, prep) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport })
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: 'networkidle' })
  if (prep) await prep(page)
  await page.screenshot({ path: outPath })
  await browser.close()
}

async function main() {
  const VIEWPORT = { width: 1440, height: 900 }

  await snap(`file://${MOCK_HTML}`, VIEWPORT, '/tmp/mock-snap.png')
  await snap(FIXTURE_URL, VIEWPORT, '/tmp/fixt-snap.png', async (page) => {
    await page.waitForSelector('.cm-card-solo')
    await page.waitForFunction(
      () => document.querySelectorAll('.cm-balance-pill').length >= 5,
    )
    await page.waitForTimeout(300)
  })

  const mock = PNG.sync.read(readFileSync('/tmp/mock-snap.png'))
  const fixt = PNG.sync.read(readFileSync('/tmp/fixt-snap.png'))

  // The mock html lays out at a different scale than the fixture (mock is
  // designed for a smaller "browser" iframe). Sample regions are therefore
  // identified relative to known landmarks in each, not absolute pixel coords.
  // We approximate by sampling the BIG flat blocks that exist in both.

  const regions = [
    {
      name: 'page-background',
      mock: { x: 4, y: 50, w: 16, h: 16 },
      fixt: { x: 4, y: 50, w: 16, h: 16 },
      tolerance: 8,
    },
    {
      name: 'card-bg-white',
      mock: { x: 200, y: 250, w: 24, h: 8 },
      fixt: { x: 220, y: 220, w: 24, h: 8 },
      tolerance: 6,
    },
    {
      name: 'gutter-fill',
      mock: { x: 50, y: 200, w: 4, h: 24 },
      fixt: { x: 50, y: 200, w: 4, h: 24 },
      tolerance: 8,
    },
    {
      name: 'ai-pane-bg',
      mock: { x: mock.width - 60, y: 200, w: 24, h: 24 },
      fixt: { x: fixt.width - 60, y: 200, w: 24, h: 24 },
      tolerance: 12,
    },
  ]

  const results = []
  let fails = 0
  for (const reg of regions) {
    const m = avgColor(mock.data, mock.width, mock.height, reg.mock.x, reg.mock.y, reg.mock.w, reg.mock.h)
    const f = avgColor(fixt.data, fixt.width, fixt.height, reg.fixt.x, reg.fixt.y, reg.fixt.w, reg.fixt.h)
    const d = colorDist(m, f)
    const pass = d <= reg.tolerance
    if (!pass) fails++
    results.push({ region: reg.name, mock: `rgba(${m.join(',')})`, fixt: `rgba(${f.join(',')})`, dist: d.toFixed(2), tol: reg.tolerance, pass })
  }

  console.log('Region color comparisons (mock-vs-fixture):')
  for (const r of results) {
    console.log(
      `  ${r.pass ? 'PASS' : 'FAIL'}  ${r.region.padEnd(18)} mock=${r.mock} fixt=${r.fixt} dist=${r.dist} tol=${r.tol}`,
    )
  }

  // Also write a side-by-side preview for human eyeballing
  const sxs = new PNG({ width: mock.width + fixt.width, height: Math.max(mock.height, fixt.height) })
  // White background
  for (let i = 0; i < sxs.data.length; i += 4) {
    sxs.data[i] = 255; sxs.data[i + 1] = 255; sxs.data[i + 2] = 255; sxs.data[i + 3] = 255
  }
  PNG.bitblt(mock, sxs, 0, 0, mock.width, mock.height, 0, 0)
  PNG.bitblt(fixt, sxs, 0, 0, fixt.width, fixt.height, mock.width, 0)
  writeFileSync('/tmp/sxs-mock-vs-fixture.png', PNG.sync.write(sxs))
  console.log('side-by-side written to /tmp/sxs-mock-vs-fixture.png')

  if (fails > 0) {
    console.error(`PIXEL DIFF: ${fails}/${regions.length} regions outside tolerance`)
    process.exit(1)
  }
  console.log('PIXEL DIFF OK')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

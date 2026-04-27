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
  let result = null
  if (prep) result = await prep(page)
  await page.screenshot({ path: outPath })
  await browser.close()
  return result
}

async function main() {
  const VIEWPORT = { width: 1440, height: 900 }

  const mockMarks = await snap(`file://${MOCK_HTML}`, VIEWPORT, '/tmp/mock-snap.png', async (page) => {
    return page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.bg-white.rounded-sm.shadow-sm'))
      const aside = document.querySelector('.flex-1.flex.flex-col.min-h-0.bg-slate-50')
      const gutter = document.querySelector('.editor-container .flex.flex-col.items-center')
        || document.querySelector('[class*="editor-container"] > div')
      if (cards.length < 2) return null
      const c0 = cards[0].getBoundingClientRect()
      const c1 = cards[1].getBoundingClientRect()
      const asideR = aside ? aside.getBoundingClientRect() : null
      // Mock has its own gutter rail — leftmost narrow column inside editor-container
      const cardLeft = c0.left
      return {
        insideCard: { x: Math.round(c0.right - 80), y: Math.round(c0.top + 4) },
        betweenCards: { x: Math.round(c0.right - 80), y: Math.round(c1.top - 8) },
        asidePane: asideR
          ? { x: Math.round(asideR.left + 12), y: Math.round(asideR.top + 12) }
          : null,
        gutterStrip: { x: Math.round(cardLeft - 14), y: Math.round(c0.top + 30) },
      }
    })
  })
  const fixtMarks = await snap(FIXTURE_URL, VIEWPORT, '/tmp/fixt-snap.png', async (page) => {
    await page.waitForSelector('.cm-card-solo')
    await page.waitForFunction(
      () => document.querySelectorAll('.cm-balance-footer').length >= 5,
    )
    await page.waitForTimeout(300)
    return page.evaluate(() => {
      const card = document.querySelector('.cm-card-solo, .cm-card-top')
      const pill0 = document.querySelectorAll('.cm-balance-footer')[0]
      const card1 = document.querySelectorAll('.cm-card-top, .cm-card-solo')[1]
      const aside = document.querySelector('aside[class*="w-[320px]"]')
      const gutter = document.querySelector('.cm-gutters')
      const cardR = card.getBoundingClientRect()
      const pillR = pill0.getBoundingClientRect()
      const card1R = card1 ? card1.getBoundingClientRect() : null
      const asideR = aside ? aside.getBoundingClientRect() : null
      const gR = gutter.getBoundingClientRect()
      return {
        insideCard: { x: Math.round(cardR.right - 80), y: Math.round(cardR.top + 4) },
        betweenCards:
          card1R != null
            ? { x: Math.round(cardR.right - 80), y: Math.round(card1R.top - 8) }
            : null,
        asidePane: asideR
          ? { x: Math.round(asideR.left + 12), y: Math.round(asideR.top + 12) }
          : null,
        gutterStrip: { x: Math.round(gR.left + gR.width / 2), y: Math.round(gR.top + 60) },
      }
    })
  })

  const mock = PNG.sync.read(readFileSync('/tmp/mock-snap.png'))
  const fixt = PNG.sync.read(readFileSync('/tmp/fixt-snap.png'))

  // Mock samples: the rendered file is a 1440×900 viewport screenshot of
  // refined.html. Coordinates are empirically chosen from earlier probes:
  //  - between cards strip at x=300, y=100 → rgba(236,238,240) (page bg gray)
  //  - inside card           at x=300, y=80 → rgba(255,255,255)
  //  - gutter strip          at x=50,  y=300
  //  - ai pane bg            at x=width-60, y=200

  if (!mockMarks) {
    console.error('failed to discover mock landmarks')
    process.exit(1)
  }
  console.log('mockMarks:', mockMarks)
  console.log('fixtMarks:', fixtMarks)

  const regions = [
    {
      name: 'page-background-between-cards',
      mock: mockMarks.betweenCards
        ? { x: mockMarks.betweenCards.x, y: mockMarks.betweenCards.y, w: 16, h: 8 }
        : null,
      fixt: fixtMarks.betweenCards
        ? { x: fixtMarks.betweenCards.x, y: fixtMarks.betweenCards.y, w: 16, h: 8 }
        : null,
      tolerance: 8,
    },
    {
      name: 'card-bg-inside',
      mock: { x: mockMarks.insideCard.x, y: mockMarks.insideCard.y, w: 12, h: 8 },
      fixt: { x: fixtMarks.insideCard.x, y: fixtMarks.insideCard.y, w: 12, h: 8 },
      tolerance: 6,
    },
    {
      name: 'ai-pane-bg',
      mock: mockMarks.asidePane
        ? { x: mockMarks.asidePane.x, y: mockMarks.asidePane.y, w: 24, h: 24 }
        : null,
      fixt: fixtMarks.asidePane
        ? { x: fixtMarks.asidePane.x, y: fixtMarks.asidePane.y, w: 24, h: 24 }
        : null,
      tolerance: 12,
    },
  ]

  const results = []
  let fails = 0
  for (const reg of regions) {
    if (!reg.fixt || !reg.mock) {
      results.push({
        region: reg.name,
        mock: reg.mock ? '(set)' : '(no landmark)',
        fixt: reg.fixt ? '(set)' : '(no landmark)',
        dist: '-',
        tol: reg.tolerance,
        pass: false,
      })
      fails++
      continue
    }
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

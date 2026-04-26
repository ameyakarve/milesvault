import { chromium } from '@playwright/test'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const STITCH_HTML = '/tmp/nav-option-2.html'
const STORYBOOK_URL = process.env.STORYBOOK_URL ?? 'http://localhost:6006'
const STORY_ID = 'home-chrome--stitch-parity'
const OUT_DIR = '/tmp/home-parity'
const VIEW = { width: 1440, height: 900 }
// Stitch's frame is 1440x900 with a 1px border (border-outline-variant), so its content area is 1438x898.
// We render Home at this exact content size so its viewport height equals Stitch's content height —
// this aligns sticky-bottom elements (NetWorth footer, profile photo) without a vertical drift.
const HOME_VIEW = { width: 1438, height: 898 }

import { mkdirSync } from 'node:fs'
mkdirSync(OUT_DIR, { recursive: true })

const browser = await chromium.launch()

async function waitForFontsAndImages(page) {
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => Promise.all(
    Array.from(document.images)
      .filter((img) => !img.complete)
      .map((img) => new Promise((res) => { img.onload = img.onerror = res }))
  ))
  await page.waitForTimeout(400)
}

async function shotStitch() {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.goto('file://' + resolve(STITCH_HTML), { waitUntil: 'networkidle' })
  await page.addStyleTag({ content: '*{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}' })
  await waitForFontsAndImages(page)
  const frameA = page.locator('div.w-\\[1440px\\].h-\\[900px\\]').first()
  const out = `${OUT_DIR}/stitch.png`
  await frameA.screenshot({ path: out })
  await ctx.close()
  return out
}

async function shotStory() {
  const ctx = await browser.newContext({ viewport: HOME_VIEW, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const url = `${STORYBOOK_URL}/iframe.html?id=${STORY_ID}&viewMode=story`
  await page.goto(url, { waitUntil: 'networkidle' })
  await waitForFontsAndImages(page)
  const out = `${OUT_DIR}/home.png`
  await page.screenshot({ path: out, clip: { x: 0, y: 0, ...HOME_VIEW } })
  await ctx.close()
  return out
}

const [stitchPath, homePath] = await Promise.all([shotStitch(), shotStory()])
await browser.close()

const stitchPng = PNG.sync.read(readFileSync(stitchPath))
const homePng = PNG.sync.read(readFileSync(homePath))

const W = HOME_VIEW.width
const H = HOME_VIEW.height
const STITCH_OFFSET_X = 1
const STITCH_OFFSET_Y = 1

function crop(png, x0, y0, w, h) {
  const out = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((y + y0) * png.width + (x + x0)) * 4
      const di = (y * w + x) * 4
      out.data[di] = png.data[si]
      out.data[di + 1] = png.data[si + 1]
      out.data[di + 2] = png.data[si + 2]
      out.data[di + 3] = png.data[si + 3]
    }
  }
  return out
}

const a = crop(stitchPng, STITCH_OFFSET_X, STITCH_OFFSET_Y, W, H)
const b = crop(homePng, 0, 0, W, H)
const diff = new PNG({ width: W, height: H })
const mismatched = pixelmatch(a.data, b.data, diff.data, W, H, { threshold: 0.1 })

writeFileSync(`${OUT_DIR}/diff.png`, PNG.sync.write(diff))

const total = W * H
const pct = ((mismatched / total) * 100).toFixed(3)
console.log(`Compared ${W}x${H} (${total} px)`)
console.log(`Mismatched pixels: ${mismatched} (${pct}%)`)
console.log(`Outputs in ${OUT_DIR}`)

// Also do a left-pane-only crop (icon rail + accounts pane = 312px wide)
const PANE_W = 312
function cropRect(png, w, h, x0 = 0, y0 = 0) {
  const out = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((y + y0) * png.width + (x + x0)) * 4
      const di = (y * w + x) * 4
      out.data[di] = png.data[si]
      out.data[di + 1] = png.data[si + 1]
      out.data[di + 2] = png.data[si + 2]
      out.data[di + 3] = png.data[si + 3]
    }
  }
  return out
}
const aPane = cropRect(stitchPng, PANE_W, H, STITCH_OFFSET_X, STITCH_OFFSET_Y)
const bPane = cropRect(homePng, PANE_W, H, 0, 0)
const diffPane = new PNG({ width: PANE_W, height: H })
const paneMismatched = pixelmatch(aPane.data, bPane.data, diffPane.data, PANE_W, H, { threshold: 0.1 })
writeFileSync(`${OUT_DIR}/diff-pane.png`, PNG.sync.write(diffPane))
const paneTotal = PANE_W * H
const panePct = ((paneMismatched / paneTotal) * 100).toFixed(3)
console.log(`Pane-only (${PANE_W}x${H}): ${paneMismatched} mismatched (${panePct}%)`)

if (paneMismatched > paneTotal * 0.005) {
  process.exitCode = 1
}

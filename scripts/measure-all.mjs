import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

const refPng = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
const minePng = PNG.sync.read(readFileSync('/tmp/ss-shell.png'))

const BG = [244, 246, 248]
const WHITE = [255, 255, 255]
const TEAL_BORDER = [8, 145, 178]

function px(png, x, y) {
  const i = (y * png.width + x) * 4
  return [png.data[i], png.data[i + 1], png.data[i + 2]]
}
function dist(a, b) { return Math.max(Math.abs(a[0]-b[0]), Math.abs(a[1]-b[1]), Math.abs(a[2]-b[2])) }
function near(a, b, tol) { return dist(a, b) <= tol }

function cardSpansFiltered(png, x, yStart, yEnd) {
  const spans = []
  let inCard = false, top = -1, lastNonBg = -1
  for (let y = yStart; y < yEnd; y++) {
    const c = px(png, x, y)
    const isBg = near(c, BG, 8)
    if (!isBg) {
      if (!inCard) { top = y; inCard = true }
      lastNonBg = y
    } else if (inCard && y - lastNonBg > 8) {
      if (lastNonBg - top >= 30) spans.push({ top, bottom: lastNonBg })
      inCard = false
    }
  }
  if (inCard && lastNonBg - top >= 30) spans.push({ top, bottom: lastNonBg })
  return spans
}

function colSampleVertical(png, x, yStart, yEnd) {
  const out = []
  for (let y = yStart; y < yEnd; y++) {
    out.push(px(png, x, y))
  }
  return out
}

// Find left edge of card body at row y (search white from left)
function cardLeftAt(png, y) {
  for (let x = 0; x < png.width; x++) {
    const c = px(png, x, y)
    if (near(c, WHITE, 6) || (c[0] > 240 && c[1] > 240 && c[2] > 240 && !near(c, BG, 4))) {
      return x
    }
  }
  return -1
}
function cardRightAt(png, y) {
  for (let x = png.width - 1; x >= 0; x--) {
    const c = px(png, x, y)
    if (near(c, WHITE, 6) || (c[0] > 240 && c[1] > 240 && c[2] > 240 && !near(c, BG, 4))) {
      return x
    }
  }
  return -1
}

console.log(`\n========== UNSELECTED CARD 1 (top of doc) ==========`)
const refSpans = cardSpansFiltered(refPng, 1500, 350, 2700)
const mineSpans = cardSpansFiltered(minePng, 1500, 350, 2700)
console.log('ref card spans 2x px:', refSpans.slice(0, 3).map(s => `[${s.top}-${s.bottom} h=${s.bottom-s.top+1}]`).join(' '))
console.log('mine card spans 2x px:', mineSpans.slice(0, 3).map(s => `[${s.top}-${s.bottom} h=${s.bottom-s.top+1}]`).join(' '))

const r1 = refSpans[0], m1 = mineSpans[0]
const r1MidY = Math.floor((r1.top + r1.bottom) / 2)
const m1MidY = Math.floor((m1.top + m1.bottom) / 2)
const r1L = cardLeftAt(refPng, r1MidY)
const r1R = cardRightAt(refPng, r1MidY)
const m1L = cardLeftAt(minePng, m1MidY)
const m1R = cardRightAt(minePng, m1MidY)

console.log(`\n[2x px / logical]`)
console.log(`Card 1 box:`)
console.log(`  ref:  top=${r1.top}/${r1.top/2}  bot=${r1.bottom}/${r1.bottom/2}  L=${r1L}/${r1L/2}  R=${r1R}/${r1R/2}  h=${r1.bottom-r1.top+1}/${(r1.bottom-r1.top+1)/2}  w=${r1R-r1L+1}/${(r1R-r1L+1)/2}`)
console.log(`  mine: top=${m1.top}/${m1.top/2}  bot=${m1.bottom}/${m1.bottom/2}  L=${m1L}/${m1L/2}  R=${m1R}/${m1R/2}  h=${m1.bottom-m1.top+1}/${(m1.bottom-m1.top+1)/2}  w=${m1R-m1L+1}/${(m1R-m1L+1)/2}`)
console.log(`  Δ:    top=${m1.top-r1.top}/${(m1.top-r1.top)/2}  bot=${m1.bottom-r1.bottom}/${(m1.bottom-r1.bottom)/2}  L=${m1L-r1L}/${(m1L-r1L)/2}  R=${m1R-r1R}/${(m1R-r1R)/2}  Δh=${(m1.bottom-m1.top)-(r1.bottom-r1.top)}/${((m1.bottom-m1.top)-(r1.bottom-r1.top))/2}  Δw=${(m1R-m1L)-(r1R-r1L)}/${((m1R-m1L)-(r1R-r1L))/2}`)

// Inter-card gap card1->card2
if (refSpans.length >= 2 && mineSpans.length >= 2) {
  const refGap = refSpans[1].top - refSpans[0].bottom - 1
  const mineGap = mineSpans[1].top - mineSpans[0].bottom - 1
  console.log(`\nInter-card gap (1->2):  ref=${refGap}/${refGap/2}  mine=${mineGap}/${mineGap/2}  Δ=${mineGap-refGap}/${(mineGap-refGap)/2}`)
}

// Synthetic summary band sampling at left side of card content (well inside card)
function bandHeight(png, cardTop, cardLeft) {
  // band background should be SLATE_50 (248,250,252); body is WHITE (255,255,255)
  const sampleX = cardLeft + 200  // well inside content
  let h = 0
  for (let y = cardTop; y < cardTop + 80; y++) {
    const c = px(png, sampleX, y)
    if (near(c, WHITE, 4)) break  // hit white body
    h++
  }
  return h
}
const refBand = bandHeight(refPng, r1.top, r1L)
const mineBand = bandHeight(minePng, m1.top, m1L)
console.log(`\nSynthetic summary band height: ref=${refBand}/${refBand/2}  mine=${mineBand}/${mineBand/2}  Δ=${mineBand-refBand}/${(mineBand-refBand)/2}`)

// Header line height (between band end and posting1 inner-rail/chip start)
// Find first row where there's content that looks like posting (chip pill or inner-rail)
function findRailY(png, cardTop, cardLeft) {
  const sampleX = cardLeft + 30  // close to left card edge to catch inner rail
  for (let y = cardTop + 30; y < cardTop + 200; y++) {
    const c = px(png, sampleX, y)
    if (!near(c, WHITE, 6) && !near(c, BG, 8)) return y
  }
  return -1
}
const refRailY = findRailY(refPng, r1.top, r1L)
const mineRailY = findRailY(minePng, m1.top, m1L)
console.log(`\nInner rail starts at: ref=${refRailY}  mine=${mineRailY}  Δ=${mineRailY-refRailY}`)

// ========== SELECTED CARD ==========
console.log(`\n========== SELECTED CARD (teal border) ==========`)
function findTealRanges(png) {
  const yPoints = new Set()
  for (let y = 350; y < png.height - 50; y++) {
    for (let x = 200; x < 1200; x++) {
      const c = px(png, x, y)
      if (near(c, TEAL_BORDER, 35)) { yPoints.add(y); break }
    }
  }
  if (yPoints.size === 0) return null
  const ys = [...yPoints].sort((a,b) => a-b)
  const groups = [[ys[0]]]
  for (let i = 1; i < ys.length; i++) {
    if (ys[i] - ys[i-1] > 30) groups.push([ys[i]])
    else groups[groups.length-1].push(ys[i])
  }
  return groups.map(g => ({ top: g[0], bot: g[g.length-1] }))
}
const refTeal = findTealRanges(refPng)
const mineTeal = findTealRanges(minePng)
console.log('ref teal regions:', refTeal)
console.log('mine teal regions:', mineTeal)

// active bg tint
function activeBgColor(png, region) {
  if (!region) return null
  const midY = Math.floor((region.top + region.bot) / 2)
  // find non-white, non-bg pixel
  const counts = new Map()
  for (let x = 600; x < 2200; x += 50) {
    const c = px(png, x, midY)
    if (near(c, WHITE, 3)) continue
    const k = c.join(',')
    counts.set(k, (counts.get(k) || 0) + 1)
  }
  return [...counts.entries()].sort((a,b) => b[1]-a[1])[0]
}

if (refTeal && refTeal.length > 0) {
  const refSelTop = Math.min(...refTeal.map(r => r.top))
  const refSelBot = Math.max(...refTeal.map(r => r.bot))
  console.log(`\nRef selected card: y=${refSelTop}-${refSelBot} h=${refSelBot-refSelTop+1}/${(refSelBot-refSelTop+1)/2}`)
  // sample teal border thickness on left
  const midY = Math.floor((refSelTop + refSelBot) / 2)
  let firstTealX = -1, lastTealX = -1
  for (let x = 200; x < 800; x++) {
    const c = px(refPng, x, midY)
    if (near(c, TEAL_BORDER, 35)) {
      if (firstTealX === -1) firstTealX = x
      lastTealX = x
    } else if (firstTealX !== -1) break
  }
  console.log(`Ref left teal border at x=${firstTealX}-${lastTealX} (thickness ${lastTealX-firstTealX+1}px / ${(lastTealX-firstTealX+1)/2} logical)`)
  console.log(`Ref active bg color: rgb(${activeBgColor(refPng, { top: refSelTop, bot: refSelBot })})`)
}
if (mineTeal && mineTeal.length > 0) {
  const mineSelTop = Math.min(...mineTeal.map(r => r.top))
  const mineSelBot = Math.max(...mineTeal.map(r => r.bot))
  console.log(`\nMine selected card: y=${mineSelTop}-${mineSelBot} h=${mineSelBot-mineSelTop+1}/${(mineSelBot-mineSelTop+1)/2}`)
  const midY = Math.floor((mineSelTop + mineSelBot) / 2)
  let firstTealX = -1, lastTealX = -1
  for (let x = 200; x < 800; x++) {
    const c = px(minePng, x, midY)
    if (near(c, TEAL_BORDER, 35)) {
      if (firstTealX === -1) firstTealX = x
      lastTealX = x
    } else if (firstTealX !== -1) break
  }
  console.log(`Mine left teal border at x=${firstTealX}-${lastTealX} (thickness ${lastTealX-firstTealX+1}px / ${(lastTealX-firstTealX+1)/2} logical)`)
  console.log(`Mine active bg color: rgb(${activeBgColor(minePng, { top: mineSelTop, bot: mineSelBot })})`)
}

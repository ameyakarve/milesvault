import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

const refPng = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
const minePng = PNG.sync.read(readFileSync('/tmp/ss-card1-selected.png'))

const TEAL = [8, 145, 178]
function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function near(a, b, t) { return Math.max(Math.abs(a[0]-b[0]), Math.abs(a[1]-b[1]), Math.abs(a[2]-b[2])) <= t }
function hex(c) { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') }

function railVertical(p, label) {
  // Find x of the teal rail (use a midY that's clearly inside card)
  // First find any teal pixel
  const tealCols = new Map()
  for (let y = 0; y < p.height; y++) {
    for (let x = 100; x < 1500; x++) {
      const c = px(p, x, y)
      if (near(c, TEAL, 35)) {
        tealCols.set(x, (tealCols.get(x) || 0) + 1)
      }
    }
  }
  const sorted = [...tealCols.entries()].sort((a,b) => b[1]-a[1])
  const railX = sorted[0]?.[0]
  if (!railX) { console.log(`${label}: no rail`); return }
  console.log(`${label} rail x=${railX}/${railX/2}`)

  // Vertical extent of rail (continuous teal at this x)
  const runs = []
  let inRun = false, runStart = -1, lastY = -1
  for (let y = 0; y < p.height; y++) {
    const c = px(p, railX, y)
    const isTeal = near(c, TEAL, 35)
    if (isTeal) {
      if (!inRun) { runStart = y; inRun = true }
      lastY = y
    } else if (inRun && y - lastY > 2) {
      runs.push({ y: runStart, h: lastY - runStart + 1 })
      inRun = false
    }
  }
  if (inRun) runs.push({ y: runStart, h: lastY - runStart + 1 })
  runs.filter(r => r.h > 5).forEach(r => {
    console.log(`  rail run y=${r.y}-${r.y+r.h-1}/${r.y/2}-${(r.y+r.h-1)/2} h=${r.h}/${r.h/2}`)
  })
  return { railX, runs }
}

console.log('=== RAIL VERTICAL EXTENT ===')
const refRail = railVertical(refPng, 'REF')
const mineRail = railVertical(minePng, 'MINE')

// Sample colors in the description (txn-desc) widget vs the card body for both
function sampleVerticalColumn(p, label, x) {
  console.log(`\n=== ${label} vertical color profile at x=${x}/${x/2} ===`)
  let last = null
  let runStart = -1
  // Limit to selected card region
  const ranges = label.startsWith('REF') ? [[2100, 2400]] : [[330, 680]]
  for (const [yS, yE] of ranges) {
    for (let y = yS; y < Math.min(yE, p.height); y++) {
      const c = px(p, x, y)
      const h = hex(c)
      if (h !== last) {
        if (last !== null) console.log(`  y=${runStart}-${y-1}/${runStart/2}-${(y-1)/2}: ${last}`)
        last = h
        runStart = y
      }
    }
    if (last !== null) console.log(`  y=${runStart}-${yE-1}/${runStart/2}-${(yE-1)/2}: ${last}`)
  }
}

// For each: sample at x INSIDE card body (e.g. 1500 in 2x for both)
sampleVerticalColumn(refPng, 'REF interior', 1500)
sampleVerticalColumn(minePng, 'MINE interior', 1500)

// Sample at x just LEFT of rail (x=railX-10) — that's the "left margin" inside card
sampleVerticalColumn(refPng, 'REF left-of-rail', refRail.railX - 10)
sampleVerticalColumn(minePng, 'MINE left-of-rail', mineRail.railX - 10)

// Sample horizontally across description (txn-desc) widget area
function sampleHorizontalRow(p, label, y) {
  console.log(`\n=== ${label} horizontal at y=${y}/${y/2} ===`)
  let last = null
  let runStart = -1
  for (let x = 380; x < 2300; x++) {
    const c = px(p, x, y)
    const h = hex(c)
    if (h !== last) {
      if (last !== null && x - runStart > 3) console.log(`  x=${runStart}-${x-1}/${runStart/2}-${(x-1)/2}: ${last}`)
      last = h
      runStart = x
    }
  }
}

// Find description widget Y positions in each
// REF: selected card top=2156. The description widget might be ABOVE that.
// MINE: selected card top=420 (from prior data). description widget above it.
console.log('\n--- Description widget area ---')
sampleHorizontalRow(refPng, 'REF desc area (above selected card top)', 2140)
sampleHorizontalRow(refPng, 'REF in-card row', 2200)
sampleHorizontalRow(minePng, 'MINE desc area', 380)
sampleHorizontalRow(minePng, 'MINE in-card row', 500)

// Edge of card colors (left edge of selected card to detect drop shadow gradient)
console.log('\n--- Left-edge drop shadow gradient ---')
function sampleHorizontalEdge(p, label, y, xS=380, xE=460) {
  console.log(`${label} y=${y}/${y/2} x=${xS}-${xE}:`)
  let last = null
  for (let x = xS; x < xE; x++) {
    const c = px(p, x, y)
    const h = hex(c)
    if (h !== last) { console.log(`  x=${x}/${x/2}: ${h}`); last = h }
  }
}
sampleHorizontalEdge(refPng, 'REF', 2250, 380, 460)
sampleHorizontalEdge(minePng, 'MINE', 500, 380, 460)
sampleHorizontalEdge(refPng, 'REF', 2250, 2200, 2280)
sampleHorizontalEdge(minePng, 'MINE', 500, 2200, 2280)

import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

const refPng = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
const minePng = PNG.sync.read(readFileSync('/tmp/ss-card1-selected.png'))

function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function hex(c) { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') }

// Find text-like dark pixels (not bg, not teal) in given y range
function darkPixelHistogram(p, yS, yE, xS, xE) {
  const counts = new Map()
  for (let y = yS; y < yE; y++) {
    for (let x = xS; x < xE; x++) {
      const c = px(p, x, y)
      const sum = c[0] + c[1] + c[2]
      // text pixels: sum below ~600 (roughly < 200 avg)
      if (sum < 600) {
        const k = hex(c)
        counts.set(k, (counts.get(k) || 0) + 1)
      }
    }
  }
  return [...counts.entries()].sort((a,b) => b[1]-a[1]).slice(0, 8)
}

// REF selected card: y=2156-2345
// REF description widget likely just above/at top of card body; let's look at y=2095-2150 (above card top) and y=2156-2200 (header row inside card)
// REF cashback card from card spans [3] was y=1770-1995 (h=113 unselected sample). Selected one is y=2156-2345 = 190px tall.
// txn-desc widget is rendered ABOVE the card-first line but FOR the selected card the rail starts at y=2156. So txn-desc is BEFORE y=2156.

console.log('=== REF text colors ===')
console.log('y=2095-2155 (description widget area, ABOVE rail start):')
console.log('  ', darkPixelHistogram(refPng, 2095, 2155, 410, 2237))
console.log('y=2156-2240 (card header row):')
console.log('  ', darkPixelHistogram(refPng, 2156, 2240, 446, 2237))
console.log('y=2240-2345 (rest of card body):')
console.log('  ', darkPixelHistogram(refPng, 2240, 2345, 446, 2237))

console.log('\n=== MINE text colors ===')
console.log('y=300-357 (above card top, possibly desc widget):')
console.log('  ', darkPixelHistogram(minePng, 300, 357, 410, 2237))
console.log('y=358-420 (description widget area):')
console.log('  ', darkPixelHistogram(minePng, 358, 420, 410, 2237))
console.log('y=420-500 (card header row):')
console.log('  ', darkPixelHistogram(minePng, 420, 500, 446, 2237))
console.log('y=500-627 (rest of card body):')
console.log('  ', darkPixelHistogram(minePng, 500, 627, 446, 2237))

// Find rail-start-y: first y where teal at x=442 in REF
function firstTealY(p, railX, yS=0, yE=p.height) {
  for (let y = yS; y < yE; y++) {
    const c = px(p, railX, y)
    if (c[0] < 50 && c[1] > 100 && c[2] > 130) return y
  }
  return -1
}
console.log('\n=== Rail start ys ===')
console.log('REF first teal at x=442 from y=2000:', firstTealY(refPng, 442, 2000))
console.log('MINE first teal at x=442 from y=300:', firstTealY(minePng, 442, 300))

// Find description widget y range by detecting non-active-bg, non-teal text within card width
// REF description: bg is #f0fdfa. Text on that bg shows up as dark pixels.
// Look for the BAND of text that constitutes the description vs the BAND of postings.
// Use horizontal averaging to find where text density changes.

function rowDarkness(p, y, xS, xE) {
  let dark = 0
  for (let x = xS; x < xE; x++) {
    const c = px(p, x, y)
    if (c[0] + c[1] + c[2] < 600) dark++
  }
  return dark
}

console.log('\n=== REF row darkness profile y=2090-2360 (looking for description vs body bands) ===')
for (let y = 2090; y < 2360; y += 4) {
  const d = rowDarkness(refPng, y, 410, 2237)
  if (d > 5) console.log(`  y=${y}/${y/2}: dark=${d}`)
}

console.log('\n=== MINE row darkness profile y=320-630 ===')
for (let y = 320; y < 630; y += 4) {
  const d = rowDarkness(minePng, y, 410, 2237)
  if (d > 5) console.log(`  y=${y}/${y/2}: dark=${d}`)
}

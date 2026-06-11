import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

const refPng = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
const minePng = PNG.sync.read(readFileSync('/tmp/ss-card1-selected.png'))

function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function hex(c) { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') }

function scanRow(p, y, xStart, xEnd) {
  const out = []
  for (let x = xStart; x < xEnd; x++) {
    out.push({ x, c: px(p, x, y) })
  }
  return out
}

// Ref selected card midY = 2250 (2x), let's see x range 380-470 (logical 190-235)
console.log('=== REF selected card horizontal slice y=2250 (mid) ===')
const refRow = scanRow(refPng, 2250, 380, 480)
let prev = null
for (const r of refRow) {
  const h = hex(r.c)
  if (h !== prev) { console.log(`x=${r.x}/${r.x/2}: ${h} (${r.c.join(',')})`); prev = h }
}

console.log('\n=== REF selected card horizontal slice y=2160 (just below top) ===')
const refRow2 = scanRow(refPng, 2160, 380, 480)
prev = null
for (const r of refRow2) {
  const h = hex(r.c)
  if (h !== prev) { console.log(`x=${r.x}/${r.x/2}: ${h}`); prev = h }
}

console.log('\n=== REF selected card right-edge slice y=2250 ===')
const refRow3 = scanRow(refPng, 2250, 2200, 2280)
prev = null
for (const r of refRow3) {
  const h = hex(r.c)
  if (h !== prev) { console.log(`x=${r.x}/${r.x/2}: ${h}`); prev = h }
}

// Now mine selected card midY = 525 (2x)
console.log('\n=== MINE selected card horizontal slice y=525 (mid) ===')
const mineRow = scanRow(minePng, 525, 380, 480)
prev = null
for (const r of mineRow) {
  const h = hex(r.c)
  if (h !== prev) { console.log(`x=${r.x}/${r.x/2}: ${h}`); prev = h }
}

console.log('\n=== MINE selected card right-edge slice y=525 ===')
const mineRow3 = scanRow(minePng, 525, 2200, 2280)
prev = null
for (const r of mineRow3) {
  const h = hex(r.c)
  if (h !== prev) { console.log(`x=${r.x}/${r.x/2}: ${h}`); prev = h }
}

// Check whether ref selected card has SLATE_200 (E2E8F0) or any non-paper, non-teal, non-active-bg color around x=410
console.log('\n=== REF: scan for card left edge looking for ANY non-paper color y=2250 ===')
for (let x = 0; x < 500; x++) {
  const c = px(refPng, x, 2250)
  // skip pure paper
  if (Math.abs(c[0]-244) <= 2 && Math.abs(c[1]-246) <= 2 && Math.abs(c[2]-248) <= 2) continue
  console.log(`x=${x}/${x/2}: ${hex(c)} (${c.join(',')})`)
  if (x > 460) break
}

// Check ref top border row for any non-paper colors across full width
console.log('\n=== REF top row y=2156 — non-paper pixels ===')
const samples = []
for (let x = 0; x < refPng.width; x++) {
  const c = px(refPng, x, 2156)
  if (Math.abs(c[0]-244) <= 3 && Math.abs(c[1]-246) <= 3 && Math.abs(c[2]-248) <= 3) continue
  samples.push({ x, h: hex(c) })
}
const compact = []
let last = null
for (const s of samples) {
  if (s.h !== last) { compact.push(s); last = s.h }
}
console.log(`Top row non-paper changes (${samples.length} total px):`)
compact.slice(0, 40).forEach(s => console.log(`  x=${s.x}/${s.x/2}: ${s.h}`))

// Check ref BG below card and to the right (drop shadow detection)
console.log('\n=== REF below selected card y=2350-2360 colors ===')
for (let yy = 2346; yy < 2370; yy++) {
  const c = px(refPng, 1500, yy)
  console.log(`y=${yy}/${yy/2}: ${hex(c)}`)
}

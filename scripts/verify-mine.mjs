import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const minePng = PNG.sync.read(readFileSync('/tmp/ss-card1-selected.png'))
function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function hex(c) { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') }

console.log('Scanning MINE for horizontal teal at x=500, 1500, 2200 (y=200-700)')
for (const x of [500, 1500, 2200]) {
  console.log(`x=${x}:`)
  for (let y = 200; y < 700; y++) {
    const c = px(minePng, x, y)
    if (hex(c) === '#14b8a6') console.log(`  y=${y}/${y/2}`)
  }
}

console.log('\nVertical teal rail in MINE: scan x=400-460 at y=500')
for (let x = 400; x < 460; x++) {
  const c = px(minePng, x, 500)
  if (hex(c) === '#14b8a6' || hex(c) === '#0891b2') console.log(`  x=${x}/${x/2}: ${hex(c)}`)
}

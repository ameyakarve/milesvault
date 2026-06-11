import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const refPng = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function hex(c) { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') }

// REF desc widget spans y=2028 to y=~2156. Find where text rows are in this band
// Check row darkness profile to see if there are 1 or 2 rows of text
console.log('REF desc widget row darkness profile (y=2030-2160):')
for (let y = 2030; y < 2160; y += 2) {
  let dark = 0
  for (let x = 460; x < 2237; x++) {
    const c = px(refPng, x, y)
    if (c[0] + c[1] + c[2] < 600) dark++
  }
  if (dark > 5) console.log(`  y=${y}/${y/2}: dark=${dark}`)
}

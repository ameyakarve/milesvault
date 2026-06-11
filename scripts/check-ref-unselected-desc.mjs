import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const refPng = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function hex(c) { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') }

// Card 2 in REF should be unselected. Find its desc widget
// Card 1 selected: y=2028-2371 (logical 1014-1185)
// Above selected card 1, find an unselected card's desc band
console.log('REF row darkness profile y=440-680 (above selected card area):')
for (let y = 440; y < 680; y += 2) {
  let dark = 0
  for (let x = 460; x < 2237; x++) {
    const c = px(refPng, x, y)
    if (c[0] + c[1] + c[2] < 600) dark++
  }
  if (dark > 5) console.log(`  y=${y}/${y/2}: dark=${dark}`)
}

import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const minePng = PNG.sync.read(readFileSync('/tmp/ss-card1-selected.png'))
function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function hex(c) { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') }
console.log('MINE gap pixels at x=442 (rail x):')
for (let y = 245; y < 285; y++) {
  console.log(`  y=${y}/${y/2}: ${hex(px(minePng, 442, y))}`)
}

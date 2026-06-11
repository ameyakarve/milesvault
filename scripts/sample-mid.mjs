import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const minePng = PNG.sync.read(readFileSync('/tmp/ss-card1-selected.png'))
function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function hex(c) { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') }
console.log('MINE x=442 (rail x), y=498-560 (card-mid 249.4-278.8):')
for (let y = 498; y < 560; y++) {
  console.log(`  y=${y}/${y/2}: ${hex(px(minePng, 442, y))}`)
}

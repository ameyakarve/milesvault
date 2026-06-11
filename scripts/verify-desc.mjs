import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const minePng = PNG.sync.read(readFileSync('/tmp/ss-card1-selected.png'))
function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function hex(c) { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') }
console.log('MINE desc widget vertical color profile at x=1500:')
let last = null, runStart = -1
for (let y = 340; y < 425; y++) {
  const h = hex(px(minePng, 1500, y))
  if (h !== last) {
    if (last) console.log(`  y=${runStart}-${y-1}/${runStart/2}-${(y-1)/2}: ${last}`)
    last = h; runStart = y
  }
}
if (last) console.log(`  y=${runStart}-424/${runStart/2}-212: ${last}`)

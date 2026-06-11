import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const refPng = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function hex(c) { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') }
// REF desc widget: y=2030..2155, x=410..2240 (inside borders)
// Profile by x: where does each shade dominate?
console.log('REF desc widget — color by x column (sampling between text rows y=2034..2042):')
for (let x = 410; x < 2240; x += 30) {
  const counts = new Map()
  for (let y = 2034; y < 2042; y++) {
    const h = hex(px(refPng, x, y))
    counts.set(h, (counts.get(h) || 0) + 1)
  }
  const top = [...counts.entries()].sort((a,b) => b[1]-a[1])[0]
  console.log(`  x=${x}/${x/2}: ${top[0]} x${top[1]}`)
}

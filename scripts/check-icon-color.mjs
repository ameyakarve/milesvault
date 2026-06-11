import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const refPng = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function hex(c) { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') }

// REF description widget is at y~2030-2156, sample early text region
// Width: x=408 to 2238 (logical 204-1119)
console.log('REF desc widget color histogram (y=2050-2120, left-content x=460-700):')
const counts = new Map()
for (let y = 2050; y < 2120; y++) {
  for (let x = 460; x < 700; x++) {
    const c = px(refPng, x, y)
    const sum = c[0] + c[1] + c[2]
    if (sum < 700) {
      const h = hex(c)
      counts.set(h, (counts.get(h) || 0) + 1)
    }
  }
}
console.log([...counts.entries()].sort((a,b) => b[1]-a[1]).slice(0, 10))

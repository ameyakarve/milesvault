import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const refPng = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function hex(c) { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') }
console.log('REF desc widget — bg color by y row (at x=1500, free of text):')
for (let y = 2028; y < 2160; y++) {
  console.log(`  y=${y}/${y/2}: ${hex(px(refPng, 1500, y))}`)
}

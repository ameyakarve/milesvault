import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const refPng = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function hex(c) { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') }
console.log('Scanning REF for teal pixels (y=1900-2400) at x=1500')
for (let y = 1900; y < 2400; y++) {
  const c = px(refPng, 1500, y)
  const h = hex(c)
  if (h === '#14b8a6') console.log(`  y=${y}/${y/2}: ${h}`)
}
console.log('\nScanning REF for teal pixels (y=1900-2400) at x=500')
for (let y = 1900; y < 2400; y++) {
  const c = px(refPng, 500, y)
  const h = hex(c)
  if (h === '#14b8a6') console.log(`  y=${y}/${y/2}: ${h}`)
}
console.log('\nScanning REF for teal pixels (y=1900-2400) at x=2200')
for (let y = 1900; y < 2400; y++) {
  const c = px(refPng, 2200, y)
  const h = hex(c)
  if (h === '#14b8a6') console.log(`  y=${y}/${y/2}: ${h}`)
}

import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const refPng = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
const minePng = PNG.sync.read(readFileSync('/tmp/ss-card1-selected.png'))
function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function hex(c) { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') }

console.log('REF vertical teal scan at y=2200 (mid card body):')
for (let x = 380; x < 2280; x++) {
  const c = px(refPng, x, 2200)
  if (hex(c) === '#14b8a6' || hex(c) === '#0891b2') console.log(`  x=${x}/${x/2}: ${hex(c)}`)
}
console.log('\nREF vertical teal scan at y=2080 (in description widget):')
for (let x = 380; x < 2280; x++) {
  const c = px(refPng, x, 2080)
  if (hex(c) === '#14b8a6' || hex(c) === '#0891b2') console.log(`  x=${x}/${x/2}: ${hex(c)}`)
}
console.log('\nMINE vertical teal scan at y=500 (mid card body):')
for (let x = 380; x < 2280; x++) {
  const c = px(minePng, x, 500)
  if (hex(c) === '#14b8a6' || hex(c) === '#0891b2') console.log(`  x=${x}/${x/2}: ${hex(c)}`)
}
console.log('\nMINE vertical teal scan at y=380 (in desc widget):')
for (let x = 380; x < 2280; x++) {
  const c = px(minePng, x, 380)
  if (hex(c) === '#14b8a6' || hex(c) === '#0891b2') console.log(`  x=${x}/${x/2}: ${hex(c)}`)
}

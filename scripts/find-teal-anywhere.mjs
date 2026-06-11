import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const minePng = PNG.sync.read(readFileSync('/tmp/ss-card1-selected.png'))
function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function hex(c) { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') }

console.log('MINE png height:', minePng.height, 'width:', minePng.width)
// Scan for any teal/cyan pixel at x=1500
let allTeal = []
for (let y = 0; y < minePng.height; y++) {
  const c = px(minePng, 1500, y)
  const h = hex(c)
  if (h === '#14b8a6' || h === '#0891b2') allTeal.push({y, h})
}
console.log('All teal at x=1500:', allTeal.slice(0, 30))

// And scan at x=2200
allTeal = []
for (let y = 0; y < minePng.height; y++) {
  const c = px(minePng, 2200, y)
  const h = hex(c)
  if (h === '#14b8a6' || h === '#0891b2') allTeal.push({y, h})
}
console.log('All teal at x=2200:', allTeal.slice(0, 30))

// And at x=500
allTeal = []
for (let y = 0; y < minePng.height; y++) {
  const c = px(minePng, 500, y)
  const h = hex(c)
  if (h === '#14b8a6' || h === '#0891b2') allTeal.push({y, h})
}
console.log('All teal at x=500:', allTeal.slice(0, 30))

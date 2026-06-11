import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const refPng = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
const minePng = PNG.sync.read(readFileSync('/tmp/ss-card1-selected.png'))
function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function hex(c) { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') }

function rowProbe(p, name, y) {
  // Find leftmost teal-500 (#14b8a6) and leftmost cyan-600 (#0891b2) across this row
  let leftEdgeX = -1, railX = -1
  for (let x = 0; x < 600; x++) {
    const c = px(p, x, y)
    if (leftEdgeX === -1 && hex(c) === '#14b8a6') leftEdgeX = x
    if (railX === -1 && c[0] < 30 && c[1] > 130 && c[1] < 180 && c[2] > 150 && c[2] < 200) railX = x
  }
  if (leftEdgeX > 0 && railX > 0) {
    console.log(`${name} y=${y}/${y/2}: edge=${leftEdgeX}/${leftEdgeX/2}, rail=${railX}/${railX/2}, gap=${railX-leftEdgeX}/${(railX-leftEdgeX)/2}`)
  } else {
    console.log(`${name} y=${y}/${y/2}: edge=${leftEdgeX}, rail=${railX}`)
  }
}

console.log('REF rail gap to left edge across postings:')
for (let y = 2160; y < 2345; y += 10) rowProbe(refPng, 'REF', y)
console.log('\nMINE rail gap to left edge across postings:')
for (let y = 500; y < 630; y += 5) rowProbe(minePng, 'MINE', y)

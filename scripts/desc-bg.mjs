import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const refPng = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
const minePng = PNG.sync.read(readFileSync('/tmp/ss-card1-selected.png'))
function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function hex(c) { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') }

function bgHist(p, name, yS, yE, xS=420, xE=2230) {
  const counts = new Map()
  for (let y = yS; y < yE; y++) {
    for (let x = xS; x < xE; x++) {
      const c = px(p, x, y)
      const sum = c[0]+c[1]+c[2]
      if (sum > 700) {  // bg-only (light pixels)
        const h = hex(c)
        counts.set(h, (counts.get(h) || 0) + 1)
      }
    }
  }
  console.log(`${name} desc widget bg (top 5):`)
  console.log([...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5))
}
// REF desc widget interior: y=2030..2155 (between top teal and card-first start)
bgHist(refPng, 'REF', 2032, 2150)
// MINE desc widget interior: y=358..419
bgHist(minePng, 'MINE', 358, 418)

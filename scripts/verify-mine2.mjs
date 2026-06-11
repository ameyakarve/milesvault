import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const minePng = PNG.sync.read(readFileSync('/tmp/ss-card1-selected.png'))
const refPng = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function hex(c) { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') }

console.log('MINE horizontal teal at x=500, 1500, 2200 (full scan):')
for (const x of [500, 1500, 2200]) {
  for (let y = 0; y < minePng.height; y++) {
    const c = px(minePng, x, y)
    if (hex(c) === '#14b8a6') console.log(`  x=${x} y=${y}/${y/2}`)
  }
}

console.log('\nMINE card height comparison:')
console.log('  REF: top=2028 bot=2371 height=343 (logical 1014-1185, h=171)')
console.log('  MINE: see above')

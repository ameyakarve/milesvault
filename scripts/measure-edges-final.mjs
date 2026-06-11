import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

const refPng = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function hex(c) { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') }

// Sample ref at top edge (y=2098, 2099, 2100, 2101) horizontally
console.log('REF rows above/at top edge of selected card:')
for (const y of [2090, 2095, 2098, 2099, 2100, 2101, 2102]) {
  const colors = new Map()
  for (let x = 380; x < 2280; x++) {
    const h = hex(px(refPng, x, y))
    colors.set(h, (colors.get(h) || 0) + 1)
  }
  const top = [...colors.entries()].sort((a,b) => b[1]-a[1]).slice(0, 5)
  console.log(`y=${y}/${y/2}:`, top.map(([k,v]) => `${k}x${v}`).join(' '))
}

// Sample below: y=2367-2375
console.log('\nREF rows around bottom edge:')
for (const y of [2367, 2368, 2369, 2370, 2371, 2372, 2373, 2374]) {
  const colors = new Map()
  for (let x = 380; x < 2280; x++) {
    const h = hex(px(refPng, x, y))
    colors.set(h, (colors.get(h) || 0) + 1)
  }
  const top = [...colors.entries()].sort((a,b) => b[1]-a[1]).slice(0, 4)
  console.log(`y=${y}/${y/2}:`, top.map(([k,v]) => `${k}x${v}`).join(' '))
}

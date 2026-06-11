import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const shot = PNG.sync.read(readFileSync('/tmp/ss-shell.png'))
const ref = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
console.log(`shot dims: ${shot.width}x${shot.height}`)
console.log(`ref dims: ${ref.width}x${ref.height}`)
function s(png, x, y, name) {
  const i = (y * png.width + x) * 4
  console.log(`${name} @(${x},${y}): rgb(${png.data[i]}, ${png.data[i+1]}, ${png.data[i+2]})`)
}
// Inside the card content (white)
s(shot, 600, 250, 'shot-card-inner')
s(ref, 600, 250, 'ref-card-inner')
// Top of header (definitely white)
s(shot, 600, 50, 'shot-header')
s(ref, 600, 50, 'ref-header')
// far right outside any card
s(shot, 2400, 1000, 'shot-far-right')
s(ref, 2400, 1000, 'ref-far-right')

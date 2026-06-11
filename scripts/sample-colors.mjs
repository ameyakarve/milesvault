import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const ref = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
const shot = PNG.sync.read(readFileSync('/tmp/ss-shell.png'))
function sample(png, x, y, name) {
  const i = (y * png.width + x) * 4
  console.log(`${name} @(${x},${y}): rgb(${png.data[i]}, ${png.data[i+1]}, ${png.data[i+2]})`)
}
// background outside cards
sample(ref, 50, 200, 'ref-bg')
sample(shot, 50, 200, 'shot-bg')
sample(ref, 50, 600, 'ref-bg-mid')
sample(shot, 50, 600, 'shot-bg-mid')
// inside a card
sample(ref, 800, 220, 'ref-card')
sample(shot, 800, 220, 'shot-card')

import { readFileSync, writeFileSync } from 'node:fs'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

const ref = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
const shot = PNG.sync.read(readFileSync('/tmp/ss-shell.png'))

if (ref.width !== shot.width || ref.height !== shot.height) {
  console.error(`size mismatch: ref ${ref.width}x${ref.height} vs shot ${shot.width}x${shot.height}`)
  process.exit(1)
}

const { width, height } = ref
const diff = new PNG({ width, height })

const total = pixelmatch(ref.data, shot.data, diff.data, width, height, { threshold: 0.1 })
const totalPixels = width * height
const totalPct = ((total / totalPixels) * 100).toFixed(3)
console.log(`overall: ${total}/${totalPixels} px (${totalPct}%)`)

writeFileSync('/tmp/ss-shell-diff.png', PNG.sync.write(diff))

// Per-region diffs. Coords are at 2x DPR (image is 2560x2948 = 1280x1474 logical).
const REGIONS = [
  { name: 'filter-bar', x: 0, y: 0, w: 2560, h: 200 },
  { name: 'pagination-pill', x: 1080, y: 200, w: 400, h: 90 },
  { name: 'editor-cards', x: 0, y: 290, w: 2560, h: 2200 },
  { name: 'card-1-swiggy', x: 0, y: 380, w: 2560, h: 280 },
  { name: 'card-2-atm', x: 0, y: 660, w: 2560, h: 280 },
  { name: 'card-3-marriott-hotel', x: 0, y: 940, w: 2560, h: 280 },
  { name: 'card-4-marriott-bonus', x: 0, y: 1220, w: 2560, h: 280 },
  { name: 'card-5-marriott-expiry', x: 0, y: 1500, w: 2560, h: 280 },
  { name: 'card-6-cashback-active', x: 0, y: 1780, w: 2560, h: 600 },
  { name: 'ai-widget-area', x: 0, y: 2200, w: 2560, h: 250 },
]

function regionDiff(r) {
  let count = 0
  const xMax = Math.min(r.x + r.w, width)
  const yMax = Math.min(r.y + r.h, height)
  for (let y = r.y; y < yMax; y++) {
    for (let x = r.x; x < xMax; x++) {
      const i = (width * y + x) * 4
      const a = diff.data[i + 3]
      // pixelmatch marks diff pixels as red/yellow with alpha 255; matched as desaturated copy
      if (diff.data[i] === 255 && diff.data[i + 1] < 200 && a === 255) count++
    }
  }
  const region = (xMax - r.x) * (yMax - r.y)
  return { count, region, pct: ((count / region) * 100).toFixed(2) }
}

for (const r of REGIONS) {
  const { count, region, pct } = regionDiff(r)
  console.log(`${r.name.padEnd(28)} ${String(count).padStart(8)} / ${region}  ${pct}%`)
}

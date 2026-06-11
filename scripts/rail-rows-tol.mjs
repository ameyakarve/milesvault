import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const refPng = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
const minePng = PNG.sync.read(readFileSync('/tmp/ss-card1-selected.png'))
function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function hex(c) { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') }
function isRailColor(c) { return c[0] < 30 && c[1] > 130 && c[1] < 180 && c[2] > 150 && c[2] < 200 }

function railRuns(p, name) {
  const railX = 442
  const runs = []
  let inRun = false, start = -1
  for (let y = 0; y < p.height; y++) {
    const c = px(p, railX, y)
    const isCyan = isRailColor(c)
    if (isCyan && !inRun) { inRun = true; start = y }
    else if (!isCyan && inRun) { runs.push([start, y - 1]); inRun = false }
  }
  if (inRun) runs.push([start, p.height - 1])
  console.log(`${name} rail at x=442/221 (cyan-600 within tolerance):`)
  for (const [s, e] of runs) console.log(`  y=${s}-${e} (logical ${s/2}-${e/2}) h=${e-s+1}/${(e-s+1)/2}`)
}
railRuns(refPng, 'REF')
railRuns(minePng, 'MINE')

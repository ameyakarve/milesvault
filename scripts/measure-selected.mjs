import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

const refPng = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
const minePng = PNG.sync.read(readFileSync('/tmp/ss-card1-selected.png'))

const PAPER = [244, 246, 248]

function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function near(a, b, t) { return Math.max(Math.abs(a[0]-b[0]), Math.abs(a[1]-b[1]), Math.abs(a[2]-b[2])) <= t }

// Find selected card by detecting ACTIVE_BG region (#F0FDFA = 240,253,250) — distinct from PAPER (244,246,248) by max=7
function activeCardSpan(p, x) {
  // Use tighter tolerance to distinguish active bg from paper
  const ys = []
  for (let y = 0; y < p.height; y++) {
    const c = px(p, x, y)
    // Active bg: high green/blue, low-ish red (~240). Paper: ~244 across.
    const isActive = c[1] > 250 && c[2] > 245 && c[0] > 235 && c[0] < 250
    if (isActive) ys.push(y)
  }
  if (ys.length === 0) return null
  return { top: ys[0], bot: ys[ys.length-1] }
}

const refSpan = activeCardSpan(refPng, 1500)
const mineSpan = activeCardSpan(minePng, 1500)
console.log('ref selected (active bg):', refSpan, refSpan ? `h=${refSpan.bot-refSpan.top+1}/${(refSpan.bot-refSpan.top+1)/2}` : '')
console.log('mine selected (active bg):', mineSpan, mineSpan ? `h=${mineSpan.bot-mineSpan.top+1}/${(mineSpan.bot-mineSpan.top+1)/2}` : '')

if (refSpan && mineSpan) {
  console.log(`\nΔh: ${(mineSpan.bot-mineSpan.top) - (refSpan.bot-refSpan.top)}/${((mineSpan.bot-mineSpan.top) - (refSpan.bot-refSpan.top))/2}`)
}

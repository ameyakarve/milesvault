import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

const refPng = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
const mineSelPng = PNG.sync.read(readFileSync('/tmp/ss-card1-selected.png'))
const mineUnsel = PNG.sync.read(readFileSync('/tmp/ss-card1-unselected.png'))

const BG = [244, 246, 248]
const WHITE = [255, 255, 255]
const TEAL = [8, 145, 178]

function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function near(a, b, t) { return Math.max(Math.abs(a[0]-b[0]), Math.abs(a[1]-b[1]), Math.abs(a[2]-b[2])) <= t }

function cardSpansFiltered(p, x, yS, yE) {
  const r = []; let inC = false, t = -1, last = -1
  for (let y = yS; y < yE; y++) {
    const c = px(p, x, y); const isBg = near(c, BG, 8)
    if (!isBg) { if (!inC) { t = y; inC = true } last = y }
    else if (inC && y - last > 8) { if (last - t >= 30) r.push({t, b: last}); inC = false }
  }
  if (inC && last - t >= 30) r.push({t, b: last})
  return r
}
function cardLeft(p, y) { for (let x = 0; x < p.width; x++) { const c = px(p, x, y); if (c[0] > 240 && c[1] > 240 && c[2] > 240 && !near(c, BG, 4)) return x } return -1 }
function cardRight(p, y) { for (let x = p.width-1; x >= 0; x--) { const c = px(p, x, y); if (c[0] > 240 && c[1] > 240 && c[2] > 240 && !near(c, BG, 4)) return x } return -1 }
function tealLeftThickness(p, y) { let f = -1, l = -1; for (let x = 100; x < 800; x++) { const c = px(p, x, y); if (near(c, TEAL, 35)) { if (f === -1) f = x; l = x } else if (f !== -1) break } return { f, l, w: l - f + 1 } }

function dump(p, label, yStart=350, yEnd=2700) {
  const spans = cardSpansFiltered(p, 1500, yStart, yEnd)
  console.log(`${label}: ${spans.length} card spans`)
  spans.slice(0, 7).forEach((s, i) => console.log(`  [${i}] y=${s.t}-${s.b} h=${s.b-s.t+1}/${(s.b-s.t+1)/2}`))
  return spans
}

console.log('========== UNSELECTED CARD 1 (top of doc) ==========')
const refSpans = dump(refPng, 'ref ')
const unselSpans = dump(mineUnsel, 'mine')

const r1 = refSpans[0], m1 = unselSpans[0]
const r1mid = Math.floor((r1.t + r1.b) / 2), m1mid = Math.floor((m1.t + m1.b) / 2)
const r1L = cardLeft(refPng, r1mid), r1R = cardRight(refPng, r1mid)
const m1L = cardLeft(mineUnsel, m1mid), m1R = cardRight(mineUnsel, m1mid)
console.log(`\nUnselected Card 1 box [2x px / logical]:`)
console.log(`  ref:  top=${r1.t}/${r1.t/2}  bot=${r1.b}/${r1.b/2}  L=${r1L}/${r1L/2}  R=${r1R}/${r1R/2}  h=${r1.b-r1.t+1}/${(r1.b-r1.t+1)/2}  w=${r1R-r1L+1}/${(r1R-r1L+1)/2}`)
console.log(`  mine: top=${m1.t}/${m1.t/2}  bot=${m1.b}/${m1.b/2}  L=${m1L}/${m1L/2}  R=${m1R}/${m1R/2}  h=${m1.b-m1.t+1}/${(m1.b-m1.t+1)/2}  w=${m1R-m1L+1}/${(m1R-m1L+1)/2}`)
console.log(`  Δ:    top=${m1.t-r1.t}/${(m1.t-r1.t)/2}  L=${m1L-r1L}/${(m1L-r1L)/2}  R=${m1R-r1R}/${(m1R-r1R)/2}  Δh=${(m1.b-m1.t)-(r1.b-r1.t)}/${((m1.b-m1.t)-(r1.b-r1.t))/2}  Δw=${(m1R-m1L)-(r1R-r1L)}/${((m1R-m1L)-(r1R-r1L))/2}`)

if (refSpans.length >= 2 && unselSpans.length >= 2) {
  const rg = refSpans[1].t - refSpans[0].b - 1
  const mg = unselSpans[1].t - unselSpans[0].b - 1
  console.log(`\nInter-card gap (1->2):  ref=${rg}/${rg/2}  mine=${mg}/${mg/2}  Δ=${mg-rg}/${(mg-rg)/2}`)
}

// SELECTED CARD: ref's last card (cashback) is selected; mine's first card (Card 1) is selected
console.log('\n========== SELECTED CARD ==========')
function findTeal(p) {
  const ys = []
  for (let y = 350; y < p.height - 50; y++) {
    for (let x = 100; x < 1200; x++) {
      const c = px(p, x, y)
      if (near(c, TEAL, 35)) { ys.push(y); break }
    }
  }
  if (ys.length === 0) return null
  // group consecutive runs
  const groups = [[ys[0]]]
  for (let i = 1; i < ys.length; i++) {
    if (ys[i] - ys[i-1] > 30) groups.push([ys[i]])
    else groups[groups.length-1].push(ys[i])
  }
  // pick largest group
  const best = groups.sort((a,b) => b.length - a.length)[0]
  return { top: best[0], bot: best[best.length-1] }
}
const refSel = findTeal(refPng)
const mineSel = findTeal(mineSelPng)
console.log(`ref selected:  ${refSel ? `y=${refSel.top}-${refSel.bot} h=${refSel.bot-refSel.top+1}/${(refSel.bot-refSel.top+1)/2}` : 'none'}`)
console.log(`mine selected: ${mineSel ? `y=${mineSel.top}-${mineSel.bot} h=${mineSel.bot-mineSel.top+1}/${(mineSel.bot-mineSel.top+1)/2}` : 'none'}`)

if (refSel && mineSel) {
  const rmid = Math.floor((refSel.top + refSel.bot)/2), mmid = Math.floor((mineSel.top + mineSel.bot)/2)
  const rT = tealLeftThickness(refPng, rmid)
  const mT = tealLeftThickness(mineSelPng, mmid)
  console.log(`\nLeft teal border at midY:`)
  console.log(`  ref:  x=${rT.f}-${rT.l} thickness=${rT.w}/${rT.w/2}`)
  console.log(`  mine: x=${mT.f}-${mT.l} thickness=${mT.w}/${mT.w/2}`)

  // active bg color (sample inside the card)
  function activeBg(p, mid) {
    const counts = new Map()
    for (let x = 600; x < 2200; x += 25) {
      const c = px(p, x, mid)
      if (near(c, WHITE, 3) || near(c, BG, 4) || near(c, TEAL, 35)) continue
      const k = c.join(',')
      counts.set(k, (counts.get(k) || 0) + 1)
    }
    return [...counts.entries()].sort((a,b) => b[1]-a[1]).slice(0,3)
  }
  console.log(`\nActive bg colors (top 3):`)
  console.log(`  ref:  ${activeBg(refPng, rmid).map(([k,n]) => `rgb(${k})x${n}`).join(' ')}`)
  console.log(`  mine: ${activeBg(mineSelPng, mmid).map(([k,n]) => `rgb(${k})x${n}`).join(' ')}`)
}

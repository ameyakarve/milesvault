import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

const refPng = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
const minePng = PNG.sync.read(readFileSync('/tmp/ss-card1-selected.png'))

const TEAL = [8, 145, 178]
const PAPER = [244, 246, 248]

function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function near(a, b, t) { return Math.max(Math.abs(a[0]-b[0]), Math.abs(a[1]-b[1]), Math.abs(a[2]-b[2])) <= t }

// Locate selected card by left teal border (vertical run)
function findSelectedCard(p) {
  // Scan for teal pixels and group by y
  const tealY = new Set()
  for (let y = 0; y < p.height; y++) {
    for (let x = 100; x < 1500; x++) {
      const c = px(p, x, y)
      if (near(c, TEAL, 35)) { tealY.add(y); break }
    }
  }
  if (tealY.size === 0) return null
  const ys = [...tealY].sort((a,b)=>a-b)
  // group
  const groups = [[ys[0]]]
  for (let i = 1; i < ys.length; i++) {
    if (ys[i] - ys[i-1] > 30) groups.push([ys[i]])
    else groups[groups.length-1].push(ys[i])
  }
  // pick longest
  const g = groups.sort((a,b) => b.length - a.length)[0]
  return { top: g[0], bot: g[g.length-1] }
}

// At a given y, find leftmost and rightmost teal pixel and report run lengths (border thicknesses)
function tealRunsAt(p, y, xStart=0, xEnd=p.width) {
  const runs = []
  let inRun = false, runStart = -1
  for (let x = xStart; x < xEnd; x++) {
    const c = px(p, x, y)
    const isTeal = near(c, TEAL, 35)
    if (isTeal && !inRun) { runStart = x; inRun = true }
    else if (!isTeal && inRun) { runs.push({ x: runStart, w: x - runStart }); inRun = false }
  }
  if (inRun) runs.push({ x: runStart, w: xEnd - runStart })
  return runs
}

// At a given x, find vertical teal runs
function tealRunsAtX(p, x, yStart=0, yEnd=p.height) {
  const runs = []
  let inRun = false, runStart = -1
  for (let y = yStart; y < yEnd; y++) {
    const c = px(p, x, y)
    const isTeal = near(c, TEAL, 35)
    if (isTeal && !inRun) { runStart = y; inRun = true }
    else if (!isTeal && inRun) { runs.push({ y: runStart, h: y - runStart }); inRun = false }
  }
  if (inRun) runs.push({ y: runStart, h: yEnd - runStart })
  return runs
}

// Sample bg color at given x,y, returning hex
function hex(c) { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') }

function profileSelected(p, label) {
  const sel = findSelectedCard(p)
  if (!sel) { console.log(`${label}: no selected card found`); return null }
  console.log(`\n=== ${label} ===`)
  console.log(`Card y range (teal): top=${sel.top}/${sel.top/2}  bot=${sel.bot}/${sel.bot/2}  h=${sel.bot-sel.top+1}/${(sel.bot-sel.top+1)/2}`)

  const midY = Math.floor((sel.top + sel.bot) / 2)
  const topY = sel.top
  const botY = sel.bot

  // Teal at top row (horizontal top border)
  const topRuns = tealRunsAt(p, topY)
  console.log(`Teal at TOP row y=${topY}: runs=`, topRuns.map(r => `x=${r.x}-${r.x+r.w-1}/${r.x/2}-${(r.x+r.w-1)/2} w=${r.w}/${r.w/2}`).join(' | '))

  // Teal at top+5
  const top5Runs = tealRunsAt(p, topY+5)
  console.log(`Teal at TOP+5 y=${topY+5}: runs=`, top5Runs.map(r => `x=${r.x}-${r.x+r.w-1}/${r.x/2}-${(r.x+r.w-1)/2} w=${r.w}/${r.w/2}`).join(' | '))

  // Teal at midY (left & right borders)
  const midRuns = tealRunsAt(p, midY)
  console.log(`Teal at MID y=${midY}: runs=`, midRuns.map(r => `x=${r.x}-${r.x+r.w-1}/${r.x/2}-${(r.x+r.w-1)/2} w=${r.w}/${r.w/2}`).join(' | '))

  // Teal at bot
  const botRuns = tealRunsAt(p, botY)
  console.log(`Teal at BOT row y=${botY}: runs=`, botRuns.map(r => `x=${r.x}-${r.x+r.w-1}/${r.x/2}-${(r.x+r.w-1)/2} w=${r.w}/${r.w/2}`).join(' | '))

  // Find left border x (leftmost teal at midY) - vertical extent
  const leftBorderX = midRuns[0]?.x
  if (leftBorderX !== undefined) {
    const verticalRuns = tealRunsAtX(p, leftBorderX, Math.max(0, sel.top-20), Math.min(p.height, sel.bot+20))
    console.log(`Vertical teal at x=${leftBorderX}/${leftBorderX/2}:`, verticalRuns.map(r => `y=${r.y}-${r.y+r.h-1}/${r.y/2}-${(r.y+r.h-1)/2} h=${r.h}/${r.h/2}`).join(' | '))
  }

  // Sample interior bg colors at multiple positions
  console.log(`\nInterior bg sampling (avoiding teal/text):`)
  const interiors = []
  const xs = [600, 800, 1000, 1500, 2000]
  const ys = [topY+15, midY, botY-15]
  for (const xx of xs) {
    for (const yy of ys) {
      const c = px(p, xx, yy)
      if (near(c, TEAL, 35)) continue
      // skip if dark text
      if (c[0] < 200) continue
      interiors.push({ x: xx, y: yy, c, hex: hex(c) })
    }
  }
  // Group by hex
  const hexCounts = new Map()
  interiors.forEach(i => hexCounts.set(i.hex, (hexCounts.get(i.hex) || 0) + 1))
  const sorted = [...hexCounts.entries()].sort((a,b) => b[1]-a[1])
  console.log(`Top interior colors:`, sorted.slice(0, 5).map(([h,n]) => `${h}x${n}`).join(' '))

  // Drop shadow detection — sample paper bg below card
  const belowY = botY + 5
  if (belowY < p.height) {
    const samples = []
    for (let xx = leftBorderX || 500; xx < (leftBorderX || 500) + 1500 && xx < p.width; xx += 50) {
      const c = px(p, xx, belowY)
      samples.push(hex(c))
    }
    const uniqShadow = [...new Set(samples)]
    console.log(`Below-card row y=${belowY}/${belowY/2} colors:`, uniqShadow.slice(0, 6).join(' '))
  }

  return { sel, leftBorderX, midRuns, topRuns, botRuns }
}

const refProfile = profileSelected(refPng, 'REF selected card')
const mineProfile = profileSelected(minePng, 'MINE selected card')

// Detailed comparison
if (refProfile && mineProfile) {
  console.log(`\n=========== DELTAS ===========`)
  const r = refProfile, m = mineProfile

  // Border placement
  const rL = r.midRuns[0], rR = r.midRuns[r.midRuns.length - 1]
  const mL = m.midRuns[0], mR = m.midRuns[m.midRuns.length - 1]
  console.log(`Left border x:  ref=${rL?.x}/${rL?.x/2} (w=${rL?.w}/${rL?.w/2})  mine=${mL?.x}/${mL?.x/2} (w=${mL?.w}/${mL?.w/2})`)
  console.log(`Right border x: ref=${rR?.x}/${rR?.x/2} (w=${rR?.w}/${rR?.w/2})  mine=${mR?.x}/${mR?.x/2} (w=${mR?.w}/${mR?.w/2})`)

  // Teal extent at top
  console.log(`Teal top row count: ref=${r.topRuns.length}  mine=${m.topRuns.length}`)
  console.log(`Teal bot row count: ref=${r.botRuns.length}  mine=${m.botRuns.length}`)

  // Width via top runs
  if (r.topRuns.length && m.topRuns.length) {
    const rTopFirst = r.topRuns[0], rTopLast = r.topRuns[r.topRuns.length-1]
    const mTopFirst = m.topRuns[0], mTopLast = m.topRuns[m.topRuns.length-1]
    console.log(`Top border span: ref=${rTopFirst.x}-${rTopLast.x+rTopLast.w-1}/${rTopFirst.x/2}-${(rTopLast.x+rTopLast.w-1)/2}  mine=${mTopFirst.x}-${mTopLast.x+mTopLast.w-1}/${mTopFirst.x/2}-${(mTopLast.x+mTopLast.w-1)/2}`)
  }
}

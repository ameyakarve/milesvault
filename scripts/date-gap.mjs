import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const refPng = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
const minePng = PNG.sync.read(readFileSync('/tmp/ss-card1-selected.png'))
function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function hex(c) { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') }

// At a row inside card body (where day label is rendered to the left of card)
// Find: rightmost text/dark pixel of day label (LHS), leftmost teal/edge of card
function gap(p, name, yMid) {
  // Find rightmost dark pixel before x=400
  let lastDarkX = -1
  for (let x = 0; x < 410; x++) {
    const c = px(p, x, yMid)
    const sum = c[0]+c[1]+c[2]
    if (sum < 600) lastDarkX = x
  }
  // Find leftmost teal-500 on card border
  let firstTealX = -1
  for (let x = 380; x < 500; x++) {
    const c = px(p, x, yMid)
    if (hex(c) === '#14b8a6') { firstTealX = x; break }
  }
  const gapDevice = firstTealX - lastDarkX
  console.log(`${name} y=${yMid}/${yMid/2}: day-label end x=${lastDarkX}/${lastDarkX/2}, card edge x=${firstTealX}/${firstTealX/2}, gap=${gapDevice}/${gapDevice/2} logical`)
}
// REF: card body rows are y=2156-2345. Pick a row likely with date text rendered (top of selected card)
gap(refPng, 'REF (selected card top body)', 2080)
gap(refPng, 'REF (selected card mid body)', 2200)
// MINE: card body rows y=420-631
gap(minePng, 'MINE (selected card top body)', 380)
gap(minePng, 'MINE (selected card mid body)', 500)

// Also check an unselected card (for both)
gap(refPng, 'REF (unselected lower card)', 530)
gap(minePng, 'MINE (unselected card 2)', 770)

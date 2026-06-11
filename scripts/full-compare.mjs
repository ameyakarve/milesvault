import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const refPng = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
const minePng = PNG.sync.read(readFileSync('/tmp/ss-card1-selected.png'))
function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function hex(c) { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') }

// Find selected card edges in each
function findCard(p, name) {
  // Search for inner cyan rail
  let railX = -1
  for (let x = 100; x < 600; x++) {
    let count = 0
    for (let y = 200; y < p.height - 200; y++) {
      const c = px(p, x, y)
      if (hex(c) === '#0891b2') count++
    }
    if (count > 50) { railX = x; break }
  }
  // Find rail's vertical extent at railX
  const tealRows = []
  for (let y = 0; y < p.height; y++) {
    const c = px(p, railX, y)
    if (hex(c) === '#0891b2') tealRows.push(y)
  }
  // Find horizontal teal edges by scanning at x=1500
  const topRows = []
  for (let y = 0; y < p.height; y++) {
    const c = px(p, 1500, y)
    if (hex(c) === '#14b8a6') topRows.push(y)
  }
  console.log(`${name}: rail x=${railX}/${railX/2}, rail y range=${tealRows[0]}/${tealRows[0]/2}-${tealRows[tealRows.length-1]}/${tealRows[tealRows.length-1]/2}`)
  console.log(`${name}: horizontal teal lines:`, topRows.map(y => `${y}/${y/2}`).join(', '))
}
findCard(refPng, 'REF')
findCard(minePng, 'MINE')

// Find card body width by finding leftmost and rightmost teal at a card body row
function bodyWidth(p, y, name) {
  let firstX = -1, lastX = -1
  for (let x = 0; x < p.width; x++) {
    const c = px(p, x, y)
    if (hex(c) === '#14b8a6') {
      if (firstX === -1) firstX = x
      lastX = x
    }
  }
  console.log(`${name} y=${y}/${y/2}: leftmost teal x=${firstX}/${firstX/2}, rightmost x=${lastX}/${lastX/2}, width=${lastX-firstX+1}/${(lastX-firstX+1)/2}`)
}
bodyWidth(refPng, 2200, 'REF')
bodyWidth(minePng, 500, 'MINE')

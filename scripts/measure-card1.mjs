import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

const refPng = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
const minePng = PNG.sync.read(readFileSync('/tmp/ss-shell.png'))

const BG = [244, 246, 248]

function colorAt(png, x, y) {
  const i = (y * png.width + x) * 4
  return [png.data[i], png.data[i + 1], png.data[i + 2]]
}

function eq(a, b, tol = 4) {
  return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol
}

function findCard(png, name, scanStartY) {
  const x = 1500
  let inCard = false
  let topY = -1
  let bottomY = -1
  let bgRunInside = 0
  for (let y = scanStartY; y < png.height - 50; y++) {
    const c = colorAt(png, x, y)
    const isBg = eq(c, BG, 8)
    if (!isBg) {
      if (!inCard) {
        topY = y
        inCard = true
      }
      bottomY = y
      bgRunInside = 0
    } else if (inCard) {
      bgRunInside++
      if (bgRunInside > 60) break
    }
  }
  const midY = Math.floor((topY + bottomY) / 2)
  let leftX = -1
  let rightX = -1
  for (let x = 0; x < png.width; x++) {
    const c = colorAt(png, x, midY)
    if (!eq(c, BG, 8)) {
      if (leftX === -1) leftX = x
      rightX = x
    }
  }
  console.log(`${name}: top=${topY} bot=${bottomY} h=${bottomY - topY + 1}  left=${leftX} right=${rightX} w=${rightX - leftX + 1}`)
  return { topY, bottomY, leftX, rightX }
}

console.log('Scanning at x=1500 (inside card body, well right of left gutter)')
const ref = findCard(refPng, 'ref ', 500)
const mine = findCard(minePng, 'mine', 500)
console.log('\nDeltas (2x px / logical):')
console.log(`  top:    ${mine.topY - ref.topY} / ${(mine.topY - ref.topY) / 2}`)
console.log(`  bottom: ${mine.bottomY - ref.bottomY} / ${(mine.bottomY - ref.bottomY) / 2}`)
console.log(`  left:   ${mine.leftX - ref.leftX} / ${(mine.leftX - ref.leftX) / 2}`)
console.log(`  right:  ${mine.rightX - ref.rightX} / ${(mine.rightX - ref.rightX) / 2}`)
console.log(`  height: ${(mine.bottomY - mine.topY) - (ref.bottomY - ref.topY)} / ${((mine.bottomY - mine.topY) - (ref.bottomY - ref.topY)) / 2}`)
console.log(`  width:  ${(mine.rightX - mine.leftX) - (ref.rightX - ref.leftX)} / ${((mine.rightX - mine.leftX) - (ref.rightX - ref.leftX)) / 2}`)

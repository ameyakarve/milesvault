import { readFileSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const refPng = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
const minePng = PNG.sync.read(readFileSync('/tmp/ss-card1-selected.png'))

function crop(src, x0, y0, w, h) {
  const out = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((y0 + y) * src.width + (x0 + x)) * 4
      const di = (y * w + x) * 4
      out.data[di] = src.data[si]
      out.data[di+1] = src.data[si+1]
      out.data[di+2] = src.data[si+2]
      out.data[di+3] = src.data[si+3]
    }
  }
  return out
}

// REF: card edges y=2028 to y=2371, x=408 to 2240. Add some padding
const refCrop = crop(refPng, 380, 2010, 1880, 380)
writeFileSync('/tmp/ref-card1-crop.png', PNG.sync.write(refCrop))
// MINE: y=356 to 633
const mineCrop = crop(minePng, 380, 340, 1880, 320)
writeFileSync('/tmp/mine-card1-crop.png', PNG.sync.write(mineCrop))
console.log('crops saved')

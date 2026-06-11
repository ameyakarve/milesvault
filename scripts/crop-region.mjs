import { readFileSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'

const args = process.argv.slice(2)
const [src, name, x, y, w, h] = args
const png = PNG.sync.read(readFileSync(src))
const out = new PNG({ width: Number(w), height: Number(h) })
for (let yy = 0; yy < Number(h); yy++) {
  for (let xx = 0; xx < Number(w); xx++) {
    const si = ((Number(y) + yy) * png.width + (Number(x) + xx)) * 4
    const di = (yy * Number(w) + xx) * 4
    out.data[di] = png.data[si]
    out.data[di + 1] = png.data[si + 1]
    out.data[di + 2] = png.data[si + 2]
    out.data[di + 3] = png.data[si + 3]
  }
}
writeFileSync(`/tmp/crop-${name}.png`, PNG.sync.write(out))
console.log(`wrote /tmp/crop-${name}.png`)

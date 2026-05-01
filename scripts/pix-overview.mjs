import fs from 'node:fs'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

const a = PNG.sync.read(fs.readFileSync('/tmp/overview-story.png'))
const b = PNG.sync.read(fs.readFileSync('/tmp/overview-mock.png'))
console.log(`story: ${a.width}x${a.height}, mock: ${b.width}x${b.height}`)

const W = Math.min(a.width, b.width)
const H = Math.min(a.height, b.height)
const aBuf = Buffer.alloc(W * H * 4)
const bBuf = Buffer.alloc(W * H * 4)
for (let y = 0; y < H; y++) {
  a.data.copy(aBuf, y * W * 4, y * a.width * 4, y * a.width * 4 + W * 4)
  b.data.copy(bBuf, y * W * 4, y * b.width * 4, y * b.width * 4 + W * 4)
}
const diff = new PNG({ width: W, height: H })
const n = pixelmatch(aBuf, bBuf, diff.data, W, H, { threshold: 0.15, alpha: 0.3 })
fs.writeFileSync('/tmp/overview-diff.png', PNG.sync.write(diff))
console.log(`diff pixels: ${n} / ${W * H} (${((n / (W * H)) * 100).toFixed(2)}%)`)

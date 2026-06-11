import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const minePng = PNG.sync.read(readFileSync('/tmp/ss-card1-selected.png'))
function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function hex(c) { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') }
console.log('MINE bottom of card x=442 (rail), y=580-625:')
for (let y = 580; y < 625; y++) console.log(`  y=${y}/${y/2}: ${hex(px(minePng,442,y))}`)
console.log('\nMINE bottom of card x=600 (body, dark would be text, light is bg):')
for (let y = 580; y < 625; y++) console.log(`  y=${y}/${y/2}: ${hex(px(minePng,600,y))}`)

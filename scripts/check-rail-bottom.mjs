import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const refPng = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
const minePng = PNG.sync.read(readFileSync('/tmp/ss-card1-selected.png'))
function px(p, x, y) { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i+1], p.data[i+2]] }
function hex(c) { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join('') }
function isRail(c){return c[0]<30 && c[1]>130 && c[1]<180 && c[2]>150 && c[2]<200}
function isTeal500(c){return hex(c)==='#14b8a6'}
function findLast(p, name){
  let lastRail=-1, lastTeal500=-1
  for(let y=0;y<p.height;y++){
    if(isRail(px(p,442,y))) lastRail=y
    if(isTeal500(px(p,1500,y))) lastTeal500=y
  }
  console.log(`${name}: last rail y=${lastRail}/${lastRail/2}, bottom border y=${lastTeal500}/${lastTeal500/2}, gap=${lastTeal500-lastRail}/${(lastTeal500-lastRail)/2}`)
}
findLast(refPng,'REF')
findLast(minePng,'MINE')

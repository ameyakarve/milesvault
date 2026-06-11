import { readFileSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const refPng = PNG.sync.read(readFileSync('/tmp/stitch-ref-v5.png'))
const minePng = PNG.sync.read(readFileSync('/tmp/ss-card1-selected.png'))
function crop(src, x0, y0, w, h){const o=new PNG({width:w,height:h});for(let y=0;y<h;y++)for(let x=0;x<w;x++){const s=((y0+y)*src.width+(x0+x))*4,d=(y*w+x)*4;o.data[d]=src.data[s];o.data[d+1]=src.data[s+1];o.data[d+2]=src.data[s+2];o.data[d+3]=src.data[s+3]}return o}
writeFileSync('/tmp/ref-bottom.png', PNG.sync.write(crop(refPng, 380, 2280, 1880, 110)))
writeFileSync('/tmp/mine-bottom.png', PNG.sync.write(crop(minePng, 380, 540, 1880, 110)))

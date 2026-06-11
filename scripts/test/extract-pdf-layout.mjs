import { readFileSync } from 'node:fs'
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
const Y = Number(process.env.YB || 3)
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(process.argv[2])), password: process.argv[3] }).promise
const out = []
for (let i = 1; i <= doc.numPages; i++) {
  const items = (await (await doc.getPage(i)).getTextContent()).items.filter((it) => 'str' in it && 'transform' in it)
  const rows = new Map()
  for (const it of items) { const b = Math.round(it.transform[5]/Y)*Y; (rows.get(b) ?? rows.set(b,[]).get(b)).push(it) }
  for (const y of [...rows.keys()].sort((a,b)=>b-a)) {
    const r = rows.get(y).sort((a,b)=>a.transform[4]-b.transform[4])
    let line='', prev=-Infinity
    for (const it of r){ if(line && it.transform[4]-prev>1.5) line+=' '; line+=it.str; prev=it.transform[4]+(it.width??0) }
    const t=line.replace(/\s+/g,' ').trim(); if(t) out.push(t)
  }
}
console.log(out.join('\n'))

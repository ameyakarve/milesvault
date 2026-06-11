import { readFileSync } from 'node:fs'
// reuse the app's pdf extraction over node — pdfjs-dist
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
const path = process.argv[2]
const password = process.argv[3]
const data = new Uint8Array(readFileSync(path))
const doc = await pdfjs.getDocument({ data, password }).promise
let text = ''
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i)
  const content = await page.getTextContent()
  text += content.items.map((it) => it.str).join(' ') + '\n'
}
console.log(text)

import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text())
})
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
await page.goto(
  'http://localhost:6006/iframe.html?id=ledgernew-shell--stitch-v-5&viewMode=story&_=' + Date.now(),
  { waitUntil: 'domcontentloaded' },
)
await page.waitForTimeout(5000)
await page.evaluate(() => {
  const view = document.querySelector('.cm-content')
  if (!view) return
  const lines = view.querySelectorAll('.cm-line')
  if (lines.length > 0) {
    const target = lines[lines.length - 4]
    const rect = target.getBoundingClientRect()
    target.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      clientX: rect.left + 5,
      clientY: rect.top + rect.height / 2,
    }))
    target.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      clientX: rect.left + 5,
      clientY: rect.top + rect.height / 2,
    }))
  }
})
await page.waitForTimeout(500)
const debug = await page.evaluate(() => {
  const editor = document.querySelector('.cm-editor')
  if (!editor) return 'no editor'
  const view = editor.cmView ?? editor.view ?? editor.editorView
  if (!view) {
    const keys = Object.keys(editor).filter(k => k.startsWith('_') || k.includes('view') || k.includes('cm'))
    return 'editor keys: ' + keys.join(',')
  }
  return 'view found'
})
console.log('--- DEBUG ---', debug)
const lineCount = await page.evaluate(() => document.querySelectorAll('.cm-line').length)
console.log('--- LINE COUNT ---', lineCount)
const cardClasses = await page.evaluate(() => {
  const lines = document.querySelectorAll('.cm-line')
  return Array.from(lines).slice(-6).map(l => l.className)
})
console.log('--- LAST 6 LINE CLASSES ---', JSON.stringify(cardClasses, null, 2))
const body = await page.evaluate(() => document.body.innerText.slice(0, 2000))
console.log('--- BODY ---')
console.log(body)
console.log('--- ERRORS ---')
for (const e of errors) console.log(e)
await browser.close()

import { chromium } from '@playwright/test'

const URL = 'http://localhost:6006/iframe.html?id=ledger-notebookshell-scroll--tall&viewMode=story'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
page.on('console', (m) => console.log('CONSOLE', m.type(), m.text()))
await page.goto(URL, { waitUntil: 'networkidle' })
try {
  await page.waitForSelector('.cm-scroller', { timeout: 15000 })
} catch (e) {
  const html = await page.content()
  console.log('--- BODY HTML (first 2000 chars) ---')
  console.log(html.slice(0, 2000))
  console.log('--- BODY HTML END ---')
  await browser.close()
  process.exit(1)
}

const result = await page.evaluate(() => {
  const scroller = document.querySelector('.cm-scroller')
  const editor = document.querySelector('.cm-editor')
  const themeWrap = document.querySelector('.cm-theme-light, .cm-theme')
  const wrapper = document.querySelector('[data-testid="editor-wrapper"]')
  const bodyRoot = document.querySelector('[data-testid="body-root"]')
  const docHeight = document.documentElement.scrollHeight
  const winHeight = window.innerHeight
  const r = (el) => {
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      h: Math.round(rect.height),
      scrollH: el.scrollHeight,
      clientH: el.clientHeight,
      overflowY: cs.overflowY,
      height: cs.height,
      maxHeight: cs.maxHeight,
      flex: cs.flex,
      minHeight: cs.minHeight,
      display: cs.display,
      alignSelf: cs.alignSelf,
      gridTemplateRows: cs.gridTemplateRows,
    }
  }
  return {
    docHeight, winHeight,
    pageOverflows: docHeight > winHeight,
    scroller: r(scroller),
    editor: r(editor),
    themeWrap: r(themeWrap),
    wrapper: r(wrapper),
    bodyRoot: r(bodyRoot),
  }
})
console.log(JSON.stringify(result, null, 2))

const tree = await page.evaluate(() => {
  const wrapper = document.querySelector('[data-testid="editor-wrapper"]')
  const dump = (el, depth = 0) => {
    if (!el || depth > 4) return ''
    const pad = '  '.repeat(depth)
    const cs = getComputedStyle(el)
    const inline = el.getAttribute('style') || ''
    let s = `${pad}<${el.tagName.toLowerCase()} class="${el.className}" style="${inline}"> h=${Math.round(el.getBoundingClientRect().height)} computed-height=${cs.height} display=${cs.display} flex=${cs.flex} overflowY=${cs.overflowY}\n`
    for (const c of el.children) s += dump(c, depth + 1)
    return s
  }
  return dump(wrapper)
})
console.log('--- Tree ---')
console.log(tree)

const rules = await page.evaluate(() => {
  const out = []
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        const txt = rule.cssText
        if (txt.includes('cm-theme-light') || (txt.includes('> *') && txt.includes('flex'))) {
          out.push(txt.slice(0, 200))
        }
      }
    } catch {}
  }
  return out
})
console.log('--- Matching CSS rules ---')
console.log(rules.join('\n'))

// Try scrolling inside the cm-scroller and verify it scrolls
const scrolled = await page.evaluate(async () => {
  const scroller = document.querySelector('.cm-scroller')
  const before = scroller.scrollTop
  scroller.scrollTop = 500
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  return { before, after: scroller.scrollTop }
})
console.log('cm-scroller scroll:', scrolled)

await browser.close()

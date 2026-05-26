import { chromium } from '@playwright/test'

const STORY = process.env.STORY ?? 'editor-chatshell--empty'
const OUT = process.env.OUT ?? '/tmp/chat-shell.png'
const URL = `http://localhost:6006/iframe.html?id=${STORY}&viewMode=story`
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('console', (m) => console.log('[console]', m.type(), m.text()))
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const data = await page.evaluate(() => {
  function info(el) {
    if (!el) return null
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      tag: el.tagName,
      classes: (el.className?.toString?.() ?? '').slice(0, 240),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      overflow: cs.overflow,
      minHeight: cs.minHeight,
      height: cs.height,
    }
  }
  const root = document.querySelector('#storybook-root')
  const all = root ? Array.from(root.querySelectorAll('*')) : []
  return {
    rootChildCount: all.length,
    root: info(root),
    outer: info(root?.firstElementChild),
    conversation: info(root?.querySelector('[role="log"]')),
    inputGroup: info(root?.querySelector('[data-slot="input-group"]')),
    textarea: info(root?.querySelector('textarea')),
    submit: info(root?.querySelector('button[type="submit"]')),
    formCount: root?.querySelectorAll('form').length ?? 0,
    bodyHTML: document.body.innerHTML.length,
  }
})

console.log(JSON.stringify(data, null, 2))
await page.screenshot({ path: OUT, fullPage: true })
console.log('screenshot →', OUT)
await browser.close()

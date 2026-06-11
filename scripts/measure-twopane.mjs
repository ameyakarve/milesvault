import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
})
const page = await ctx.newPage()
await page.goto(
  'http://localhost:6006/iframe.html?id=ledgernew-twopane--default&viewMode=story&_=' + Date.now(),
  { waitUntil: 'domcontentloaded' },
)
await page.waitForTimeout(4000)

const m = await page.evaluate(() => {
  function rect(sel) {
    const el = document.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, w: r.width, h: r.height }
  }
  const nav = rect('nav')
  const aside = rect('aside')
  const eyebrowRow = document.querySelector('aside > div:first-child')
  const eyebrowText = eyebrowRow?.querySelector('span:nth-child(2)')
  const eyebrowDot = eyebrowRow?.querySelector('span:nth-child(1)')
  const promptBar = document.querySelector('aside > div:last-child')
  const filterRow = document.querySelectorAll('main .h-\\[36px\\]')[0]
  const chromeRowFirst = document.querySelector('main > div > div')
  const editorMain = document.querySelector('main')
  const cmEditor = document.querySelector('.cm-editor')
  const navInner = document.querySelector('nav > div > div:first-child > div')
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    nav,
    navInnerInner: navInner?.getBoundingClientRect()
      ? {
          top: navInner.getBoundingClientRect().top,
          left: navInner.getBoundingClientRect().left,
          right: navInner.getBoundingClientRect().right,
          w: navInner.getBoundingClientRect().width,
        }
      : null,
    aside,
    eyebrowText: eyebrowText?.getBoundingClientRect()
      ? {
          top: eyebrowText.getBoundingClientRect().top,
          left: eyebrowText.getBoundingClientRect().left,
          h: eyebrowText.getBoundingClientRect().height,
        }
      : null,
    eyebrowDot: eyebrowDot?.getBoundingClientRect()
      ? {
          top: eyebrowDot.getBoundingClientRect().top,
          left: eyebrowDot.getBoundingClientRect().left,
          w: eyebrowDot.getBoundingClientRect().width,
          h: eyebrowDot.getBoundingClientRect().height,
        }
      : null,
    promptBar: promptBar?.getBoundingClientRect()
      ? {
          top: promptBar.getBoundingClientRect().top,
          bottom: promptBar.getBoundingClientRect().bottom,
          h: promptBar.getBoundingClientRect().height,
        }
      : null,
    editorMain: editorMain
      ? {
          top: editorMain.getBoundingClientRect().top,
          right: editorMain.getBoundingClientRect().right,
          w: editorMain.getBoundingClientRect().width,
        }
      : null,
    cmEditor: cmEditor?.getBoundingClientRect()
      ? {
          top: cmEditor.getBoundingClientRect().top,
          left: cmEditor.getBoundingClientRect().left,
          right: cmEditor.getBoundingClientRect().right,
          w: cmEditor.getBoundingClientRect().width,
        }
      : null,
    filterRow: filterRow?.getBoundingClientRect()
      ? {
          top: filterRow.getBoundingClientRect().top,
          h: filterRow.getBoundingClientRect().height,
        }
      : null,
    chromeRowFirst: chromeRowFirst?.getBoundingClientRect()
      ? {
          top: chromeRowFirst.getBoundingClientRect().top,
          left: chromeRowFirst.getBoundingClientRect().left,
          right: chromeRowFirst.getBoundingClientRect().right,
        }
      : null,
  }
})
console.log(JSON.stringify(m, null, 2))
await browser.close()

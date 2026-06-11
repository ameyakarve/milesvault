import { chromium } from '@playwright/test'

const W = 1280
const H = 820
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })

async function probeRef(url) {
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const data = await page.evaluate(() => {
    const round = (n) => Math.round(n * 10) / 10
    const ph = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: round(r.left), y: round(r.top), w: round(r.width), h: round(r.height) }
    }
    // Find gutter: the div with classes "w-10 bg-surface-container-high"
    const gutter = document.querySelector('div.w-10.bg-surface-container-high')
    // Cards: divs with classes "flex flex-col bg-white rounded-sm shadow-sm"
    const cards = Array.from(document.querySelectorAll('div.flex.flex-col.bg-white.rounded-sm'))
    return {
      gutter: ph(gutter),
      gutterChildren: gutter
        ? Array.from(gutter.children).map((c) => ({
            text: (c.textContent || '').replace(/\s+/g, ' ').trim(),
            cls: c.className,
            ...ph(c),
          }))
        : [],
      cards: cards.map((c) => ph(c)),
    }
  })
  await page.close()
  return data
}

async function probeMine(url) {
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForSelector('.cm-content', { timeout: 30000 })
  await page.waitForTimeout(1500)
  const data = await page.evaluate(() => {
    const round = (n) => Math.round(n * 10) / 10
    const ph = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: round(r.left), y: round(r.top), w: round(r.width), h: round(r.height) }
    }
    const gutter = document.querySelector('div.w-10.shrink-0.bg-\\[\\#e0e3e5\\]')
    const cards = Array.from(document.querySelectorAll('div.flex.flex-col.bg-white.rounded-sm'))
    return {
      gutter: ph(gutter),
      gutterChildren: gutter
        ? Array.from(gutter.children).map((c) => ({
            text: (c.textContent || '').replace(/\s+/g, ' ').trim(),
            cls: c.className,
            ...ph(c),
          }))
        : [],
      cards: cards.map((c) => ph(c)),
    }
  })
  await page.close()
  return data
}

const ref = await probeRef('http://localhost:7700/refined.html')
const mine = await probeMine(
  'http://localhost:6006/iframe.html?id=ledger-notebook-view--default&viewMode=story&_=' + Date.now(),
)

console.log('REF gutter:', JSON.stringify(ref.gutter))
console.log(`REF gutterChildren count: ${ref.gutterChildren.length}`)
ref.gutterChildren.forEach((c, i) =>
  console.log(`  [${i}] y=${c.y} h=${c.h} text="${c.text}" cls="${c.cls.slice(0, 40)}"`),
)
console.log(`REF cards count: ${ref.cards.length}`)
ref.cards.forEach((c, i) => console.log(`  [${i}] y=${c.y} h=${c.h}`))

console.log('\nMINE gutter:', JSON.stringify(mine.gutter))
console.log(`MINE gutterChildren count: ${mine.gutterChildren.length}`)
mine.gutterChildren.forEach((c, i) =>
  console.log(`  [${i}] y=${c.y} h=${c.h} text="${c.text}" cls="${c.cls.slice(0, 40)}"`),
)
console.log(`MINE cards count: ${mine.cards.length}`)
mine.cards.forEach((c, i) => console.log(`  [${i}] y=${c.y} h=${c.h}`))

await browser.close()

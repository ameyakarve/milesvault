import { chromium } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'

// Probe both pages for layout coordinates of key landmarks.
async function probe(url) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const data = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('div'))
    function findHeaderRow() {
      return all.find((el) => {
        if (el.children.length !== 4) return false
        const t = Array.from(el.children).map((c) => (c.textContent || '').trim().toUpperCase())
        return t[0] === 'ACCOUNT' && /LAST ACTIVITY/.test(t[1]) && t[2] === 'CCY' && t[3] === 'BALANCE'
      })
    }
    function findFirstDataRow() {
      return all.find((el) => {
        if (el.children.length !== 4) return false
        const t = Array.from(el.children).map((c) => (c.textContent || '').trim())
        return /Wallet$/.test(t[0]) && /^2026-04-2[0-9]$/.test(t[1])
      })
    }
    const h = findHeaderRow()
    const r = findFirstDataRow()
    function rect(el) {
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
    }
    function cellsOf(el) {
      if (!el) return []
      return Array.from(el.children).map((c) => {
        const b = c.getBoundingClientRect()
        const cs = getComputedStyle(c)
        return {
          text: c.textContent?.trim().slice(0, 40),
          x: Math.round(b.x), w: Math.round(b.width),
          fontSize: cs.fontSize, color: cs.color,
        }
      })
    }
    // Page header — match the visible "Accounts" h1 (font 24px+) on either side.
    const h1 = Array.from(document.querySelectorAll('h1')).find(
      (e) => e.textContent?.trim() === 'Accounts' && parseFloat(getComputedStyle(e).fontSize) >= 24,
    )
    const sub = h1?.parentElement?.querySelector('p')
    const search = document.querySelector('input[placeholder*="Search"]')
    return {
      header: rect(h),
      headerCells: cellsOf(h),
      firstRow: rect(r),
      firstRowCells: cellsOf(r),
      h1: rect(h1),
      h1Style: h1 ? { fontSize: getComputedStyle(h1).fontSize, fontWeight: getComputedStyle(h1).fontWeight } : null,
      subRect: rect(sub),
      subText: sub?.textContent?.trim(),
      searchRect: rect(search),
      bodyBg: getComputedStyle(document.body).backgroundColor,
    }
  })
  await browser.close()
  return data
}

const mock = await probe(pathToFileURL('/tmp/stitch/accounts-v7.html').toString())
const mine = await probe('http://localhost:6006/iframe.html?id=accounts-directory-fixture--default&viewMode=story')

const out = { mock, mine }
fs.writeFileSync('/tmp/diff-accounts.json', JSON.stringify(out, null, 2))

console.log('--- HEADER ROW ---')
console.log('mock:', JSON.stringify(mock.header))
console.log('mine:', JSON.stringify(mine.header))
console.log('mock cells:', mock.headerCells.map((c) => `${c.text}@${c.x}/${c.w}`).join(' | '))
console.log('mine cells:', mine.headerCells.map((c) => `${c.text}@${c.x}/${c.w}`).join(' | '))

console.log('\n--- FIRST DATA ROW ---')
console.log('mock:', JSON.stringify(mock.firstRow))
console.log('mine:', JSON.stringify(mine.firstRow))
console.log('mock cells:', mock.firstRowCells.map((c) => `${c.text}@${c.x}/${c.w}`).join(' | '))
console.log('mine cells:', mine.firstRowCells.map((c) => `${c.text}@${c.x}/${c.w}`).join(' | '))

console.log('\n--- H1 ---')
console.log('mock:', mock.h1, mock.h1Style)
console.log('mine:', mine.h1, mine.h1Style)

console.log('\n--- SUBTITLE ---')
console.log('mock:', mock.subText, mock.subRect)
console.log('mine:', mine.subText, mine.subRect)

console.log('\n--- SEARCH RECT ---')
console.log('mock:', mock.searchRect)
console.log('mine:', mine.searchRect)

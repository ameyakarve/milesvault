import { chromium } from '@playwright/test'
import { resolve } from 'node:path'

const STITCH_HTML = '/tmp/nav-option-2.html'
const STORYBOOK_URL = process.env.STORYBOOK_URL ?? 'http://localhost:6006'
const STORY_ID = 'home-chrome--stitch-parity'
const VIEW = { width: 1440, height: 900 }

const browser = await chromium.launch()

async function inspect(label, urlOrFile, isFile) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const url = isFile ? 'file://' + resolve(urlOrFile) : urlOrFile
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  const data = await page.evaluate(() => {
    function rect(el) {
      if (!el) return null
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return {
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
        font: cs.fontFamily,
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        padding: cs.padding,
      }
    }
    const all = Array.from(document.querySelectorAll('*'))
    const findByText = (txt) => all.find((e) => e.textContent?.trim() === txt && e.children.length === 0)
    const findRow = (label) => {
      const el = findByText(label)
      if (!el) return null
      let row = el
      while (row && !row.className?.includes?.('flex justify-between')) row = row.parentElement
      return row
    }
    return {
      accounts: rect(findByText('Accounts')),
      pinned: rect(findByText('Pinned')),
      hdfc: rect(findRow('HDFC Diners Black')),
      icici: rect(findRow('ICICI Savings')),
      axis: rect(findRow('Axis Forex')),
      recent: rect(findByText('Recent')),
      amazon: rect(findRow('Amazon Pay')),
      zomato: rect(findRow('Zomato Wallet')),
      sbi: rect(findRow('SBI Savings')),
      regalia: rect(findRow('HDFC Regalia')),
      allAcc: rect(findByText('All Accounts')),
      bankCash: rect(findByText('Bank & Cash')),
      hdfcSal: rect(findRow('HDFC Salary')),
      cashWal: rect(findRow('Cash Wallet')),
      cc6: rect(findByText('Credit Cards · 6')),
      addAcc: rect(findByText('+ Add account')),
      netWorth: rect(findByText('Net Worth')),
    }
  })
  console.log(`\n=== ${label} ===`)
  for (const [k, v] of Object.entries(data)) {
    if (!v) { console.log(`${k}: null`); continue }
    console.log(`${k.padEnd(10)} y=${String(v.y).padStart(3)} h=${String(v.h).padStart(3)} fs=${v.fontSize} lh=${v.lineHeight} pad=${v.padding} font=${v.font.split(',')[0]}`)
  }
  await ctx.close()
  return data
}

const url = `${STORYBOOK_URL}/iframe.html?id=${STORY_ID}&viewMode=story`
await inspect('STITCH', STITCH_HTML, true)
await inspect('HOME', url, false)
await browser.close()

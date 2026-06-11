import { chromium } from '@playwright/test'
import { pathToFileURL } from 'node:url'

const browser = await chromium.launch()

async function probe(url, label, isV11) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 2 })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  // helper: probe each anchor by text or selector
  const data = await page.evaluate((isV11) => {
    const fields = ['backgroundColor', 'color', 'fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderTopColor', 'borderTopStyle', 'borderRadius', 'width', 'height']
    const cs = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      const s = window.getComputedStyle(el)
      const out = { rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
      for (const f of fields) out[f] = s[f]
      return out
    }
    const findText = (sel, text) => Array.from(document.querySelectorAll(sel)).find(e => e.textContent?.trim() === text)
    const closest = (el, sel) => el?.closest(sel) || null

    const out = {}
    // Left rail
    out.leftNav = cs(document.querySelector('nav'))
    out.logo = cs(document.querySelector('nav > div:first-child'))
    // Top nav
    const topNav = document.querySelectorAll('main > div')[0]
    out.topNav = cs(topNav)
    out.breadcrumbWrap = cs(topNav?.querySelector('div > div'))
    out.breadcrumbHDFC = cs(findText('span', 'HDFC'))
    out.accountSelector = cs(topNav?.querySelector('button'))
    // Account header strip
    const acctHdr = document.querySelectorAll('main > div')[1]
    out.acctHdr = cs(acctHdr)
    out.acctTitle = cs(acctHdr?.querySelector('h1'))
    out.acctPath = cs(acctHdr?.querySelector('h1 + div'))
    out.acctBalance = cs(Array.from(acctHdr?.querySelectorAll('div') || []).find(d => d.textContent?.includes('-₹47,820.00') && d.children.length === 0))
    // Dirty bar
    const dirty = document.querySelectorAll('main > div')[2]
    out.dirtyBar = cs(dirty)
    out.revertBtn = cs(findText('button', 'Revert'))
    out.saveBtn = cs(Array.from(document.querySelectorAll('button')).find(b => b.textContent?.startsWith('Save')))
    // Header row + first data row + expanded row
    const tableContainer = document.querySelectorAll('main > div')[3]
    const grids = tableContainer?.querySelectorAll('.grid')
    out.headerRow = cs(grids?.[0])
    out.dateCell = cs(grids?.[0]?.children?.[1])
    out.row1 = cs(grids?.[1])
    out.row1Date = cs(grids?.[1]?.children?.[1])
    out.row1Payee = cs(grids?.[1]?.children?.[2]?.querySelector('span'))
    out.row1Debit = cs(grids?.[1]?.children?.[3])
    // Expanded source pane
    const expandedRow = grids?.[3]
    out.expandedRow = cs(expandedRow)
    const sourcePane = isV11
      ? document.querySelector('div.ml-\\[56px\\], div[class*="ml-[56px]"]')
      : document.querySelector('div[class*="ml-[56px]"]')
    out.sourcePane = cs(sourcePane)
    out.sourcePre = cs(sourcePane?.querySelector('pre, .cm-content'))
    // AI rail
    out.aiRail = cs(document.querySelector('aside'))
    out.aiPlaceholder = cs(document.querySelector('aside div[class*="border-dashed"]'))
    out.aiTextareaWrap = cs(document.querySelector('aside div[class*="focus-within"]'))
    out.footerHint = cs(findText('div', '↓ 39 more'))

    return out
  }, isV11)
  await page.close()
  return { label, data }
}

const v11Url = pathToFileURL('/Users/vandanakarve/milesvault/tmp/stitch/per-account-v11.html').href
const sbUrl = 'http://localhost:6006/iframe.html?id=ledger-v4-per-account-view--hdfc-diners-black&viewMode=story'

const v11 = await probe(v11Url, 'v11', true)
const me = await probe(sbUrl, 'storybook', false)

await browser.close()

// Compare
const keys = new Set([...Object.keys(v11.data), ...Object.keys(me.data)])
console.log('\n=== DIFF (v11 vs storybook) ===\n')
for (const k of keys) {
  const a = v11.data[k]
  const b = me.data[k]
  if (!a || !b) {
    console.log(`[${k}] missing on ${!a ? 'v11' : 'sb'}`)
    continue
  }
  const diffs = []
  for (const f of Object.keys(a)) {
    const av = JSON.stringify(a[f])
    const bv = JSON.stringify(b[f])
    if (av !== bv) diffs.push(`  ${f}: v11=${av}  sb=${bv}`)
  }
  if (diffs.length) {
    console.log(`[${k}]`)
    diffs.forEach(d => console.log(d))
    console.log('')
  }
}

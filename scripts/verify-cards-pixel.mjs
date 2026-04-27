import { chromium } from '@playwright/test'

const PORT = process.env.STORYBOOK_PORT || '6006'
const STORYBOOK = `http://localhost:${PORT}`

async function load(page, id) {
  const url = `${STORYBOOK}/iframe.html?id=${id}&viewMode=story`
  const res = await page.goto(url, { waitUntil: 'networkidle' })
  if (!res || !res.ok()) throw new Error(`failed ${url}: ${res?.status()}`)
}

async function rgbAt(page, selector, kind) {
  return page.$eval(
    selector,
    (el, k) => {
      const cs = window.getComputedStyle(el)
      if (k === 'bg') return cs.backgroundColor
      if (k === 'color') return cs.color
      return ''
    },
    kind,
  )
}

async function main() {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errors = []

  // Demo cards (notebook-view) — they live as DOM elements with classes
  await load(page, 'ledger-notebook-view--default')
  await page.waitForSelector('.cm-balance-pill, [class*="bal"], .text-slate-500')
  // The demo uses regular HTML for balance, not the cm-balance-pill class.
  // For chrome, the static demo uses card div with bg-white border-[#bcc9c6]/15.

  const demoCardBg = await rgbAt(
    page,
    '.bg-white.rounded-sm.shadow-sm.border-\\[\\#bcc9c6\\]\\/15',
    'bg',
  )
  const demoBalLabel = await rgbAt(page, '.text-slate-400', 'color')
  const demoBalValue = await rgbAt(page, '.text-slate-500', 'color')

  console.log('demo  cardBg:', demoCardBg, 'balLabel:', demoBalLabel, 'balValue:', demoBalValue)

  // Fixture story
  await load(page, 'ledger-per-account-view-fixture--default')
  await page.waitForSelector('.cm-card-solo')
  await page.waitForSelector('.cm-balance-footer')
  await page.waitForFunction(
    () => document.querySelectorAll('.cm-balance-footer').length >= 5,
  )

  const fxCardBg = await rgbAt(page, '.cm-card-solo', 'bg')
  const fxFooterBg = await rgbAt(page, '.cm-balance-footer', 'bg')
  const fxBalLabel = await rgbAt(page, '.cm-balance-footer .cm-bal-label', 'color')
  const fxBalValue = await rgbAt(page, '.cm-balance-footer .cm-bal-value', 'color')
  const fxGutterBg = await rgbAt(page, '.cm-gutters', 'bg')
  const fxGutterFg = await rgbAt(page, '.cm-gutters', 'color')

  console.log(
    'fixt  cardBg:', fxCardBg,
    'footerBg:', fxFooterBg,
    'balLabel:', fxBalLabel,
    'balValue:', fxBalValue,
  )
  console.log('fixt  gutterBg:', fxGutterBg, 'gutterFg:', fxGutterFg)

  if (fxCardBg !== demoCardBg) errors.push(`card bg mismatch: demo=${demoCardBg} fixture=${fxCardBg}`)
  // Footer label = slate-500 (rgb 100,116,139) — darkened from prior slate-400.
  if (fxBalLabel !== 'rgb(100, 116, 139)') {
    errors.push(`footer label color=${fxBalLabel} (expected rgb(100, 116, 139))`)
  }
  // Footer value = slate-800 (rgb 30,41,59).
  if (fxBalValue !== 'rgb(30, 41, 59)') {
    errors.push(`footer value color=${fxBalValue} (expected rgb(30, 41, 59))`)
  }
  // gutter target colors per plan
  if (fxGutterBg !== 'rgb(224, 227, 229)') errors.push(`gutter bg mismatch: ${fxGutterBg}`)
  if (fxGutterFg !== 'rgb(188, 201, 198)') errors.push(`gutter fg mismatch: ${fxGutterFg}`)

  // Click into the editor first so an active-line gutter element exists
  await page.click('.cm-content')
  await page.waitForSelector('.cm-activeLineGutter', { timeout: 4000 })

  // Extra computed-style probes
  const probes = await page.evaluate(() => {
    const get = (sel, prop) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const cs = window.getComputedStyle(el)
      return cs[prop]
    }
    const findBalance = () => document.querySelector('[class*="text-2xl"]')
    const balanceEl = findBalance()
    return {
      footerTextTransform: get('footer', 'textTransform'),
      activeLineGutterBg: get('.cm-gutters .cm-activeLineGutter', 'backgroundColor'),
      activeLineGutterColor: get('.cm-gutters .cm-activeLineGutter', 'color'),
      activeLineGutterShadow: get('.cm-gutters .cm-activeLineGutter', 'boxShadow'),
      activeLineGutterCount: document.querySelectorAll('.cm-gutters .cm-activeLineGutter').length,
      deltaOutColor: get('.cm-delta-out', 'color'),
      deltaInColor: get('.cm-delta-in', 'color'),
      amountOutColor: get('.cm-amount-out', 'color'),
      amountInColor: get('.cm-amount-in', 'color'),
      amountOutFontFamily: get('.cm-amount-out', 'fontFamily'),
      amountOutFontWeight: get('.cm-amount-out', 'fontWeight'),
      amountOutTabular: get('.cm-amount-out', 'fontVariantNumeric'),
      footerPadding: get('.cm-balance-footer', 'padding'),
      footerBorderTop: get('.cm-balance-footer', 'borderTopWidth'),
      footerLabelTransform: get('.cm-balance-footer .cm-bal-label', 'textTransform'),
      footerValueFontFamily: get('.cm-balance-footer .cm-bal-value', 'fontFamily'),
      footerValueFontWeight: get('.cm-balance-footer .cm-bal-value', 'fontWeight'),
      headerBalanceFontSize: balanceEl ? window.getComputedStyle(balanceEl).fontSize : null,
      headerBalanceFontFamily: balanceEl ? window.getComputedStyle(balanceEl).fontFamily : null,
      editorBg: get('.cm-editor', 'backgroundColor'),
    }
  })
  console.log('probes:', probes)

  // Hard assertions
  if (!/251.*113.*133/.test(probes.deltaOutColor || '')) {
    errors.push(`delta-out color mismatch: ${probes.deltaOutColor} (expected rose 251,113,133)`)
  }
  if (!/20.*184.*166/.test(probes.deltaInColor || '')) {
    errors.push(`delta-in color mismatch: ${probes.deltaInColor} (expected teal 20,184,166)`)
  }
  // Amount marks: rose-600 / teal-700, JetBrains Mono, weight 500, tabular-nums.
  if (probes.amountOutColor !== 'rgb(225, 29, 72)') {
    errors.push(`amount-out color=${probes.amountOutColor} (expected rgb(225, 29, 72))`)
  }
  if (probes.amountInColor !== 'rgb(15, 118, 110)') {
    errors.push(`amount-in color=${probes.amountInColor} (expected rgb(15, 118, 110))`)
  }
  if (!/JetBrains Mono/.test(probes.amountOutFontFamily || '')) {
    errors.push(`amount-out fontFamily=${probes.amountOutFontFamily} (expected JetBrains Mono)`)
  }
  if (probes.amountOutFontWeight !== '500') {
    errors.push(`amount-out fontWeight=${probes.amountOutFontWeight} (expected 500)`)
  }
  if (!/tabular-nums/.test(probes.amountOutTabular || '')) {
    errors.push(`amount-out fontVariantNumeric=${probes.amountOutTabular} (expected tabular-nums)`)
  }
  // Footer chrome
  if (probes.footerPadding !== '8px 16px') {
    errors.push(`footer padding=${probes.footerPadding} (expected 8px 16px)`)
  }
  if (probes.footerBorderTop !== '1px') {
    errors.push(`footer borderTopWidth=${probes.footerBorderTop} (expected 1px)`)
  }
  if (probes.footerLabelTransform !== 'uppercase') {
    errors.push(`footer label textTransform=${probes.footerLabelTransform} (expected uppercase)`)
  }
  if (!/JetBrains Mono/.test(probes.footerValueFontFamily || '')) {
    errors.push(`footer value fontFamily=${probes.footerValueFontFamily} (expected JetBrains Mono)`)
  }
  if (probes.footerValueFontWeight !== '500') {
    errors.push(`footer value fontWeight=${probes.footerValueFontWeight} (expected 500)`)
  }
  if (probes.headerBalanceFontSize !== '24px') {
    errors.push(`header balance fontSize=${probes.headerBalanceFontSize} (expected 24px / text-2xl)`)
  }

  // GAP-3 hard checks
  if (probes.activeLineGutterCount === 0) {
    errors.push(`active-line gutter missing (.cm-activeLineGutter not present)`)
  } else {
    if (probes.activeLineGutterColor !== 'rgb(0, 104, 95)') {
      errors.push(`active-line gutter color=${probes.activeLineGutterColor} (expected rgb(0,104,95))`)
    }
    if (!/(0,\s*104,\s*95)|#00685f/i.test(probes.activeLineGutterShadow || '')) {
      errors.push(
        `active-line gutter box-shadow="${probes.activeLineGutterShadow}" missing teal #00685f bar`,
      )
    }
  }
  // GAP-5: editor surface must NOT paint white (transparent so parent #eceef0 shows)
  if (probes.editorBg === 'rgb(255, 255, 255)') {
    errors.push(`editor bg paints white — should be transparent so parent #eceef0 shows through`)
  }

  // Syntax tokens — sampled from cm-content
  const tokens = await page.evaluate(() => {
    const get = (sel) => {
      const el = document.querySelector(sel)
      return el ? window.getComputedStyle(el).color : null
    }
    return {
      date: get('.tok-literal') || get('.cm-content [class*="tok-literal"]') || null,
      account: get('.tok-variableName') || get('.cm-content [class*="tok-variableName"]') || null,
      number: get('.tok-number') || get('.cm-content [class*="tok-number"]') || null,
    }
  })
  console.log('tokens:', tokens)

  await browser.close()

  if (errors.length > 0) {
    console.error('PIXEL VERIFY FAILED:')
    for (const e of errors) console.error('  -', e)
    process.exit(1)
  }
  console.log('PIXEL VERIFY OK')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

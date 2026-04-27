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
  await page.waitForSelector('.cm-balance-pill')
  await page.waitForFunction(() => document.querySelectorAll('.cm-balance-pill').length >= 5)

  const fxCardBg = await rgbAt(page, '.cm-card-solo', 'bg')
  const fxBalLabel = await rgbAt(page, '.cm-balance-pill .cm-bal-label', 'color')
  const fxBalValue = await rgbAt(page, '.cm-balance-pill', 'color')
  const fxGutterBg = await rgbAt(page, '.cm-gutters', 'bg')
  const fxGutterFg = await rgbAt(page, '.cm-gutters', 'color')

  console.log('fixt  cardBg:', fxCardBg, 'balLabel:', fxBalLabel, 'balValue:', fxBalValue)
  console.log('fixt  gutterBg:', fxGutterBg, 'gutterFg:', fxGutterFg)

  if (fxCardBg !== demoCardBg) errors.push(`card bg mismatch: demo=${demoCardBg} fixture=${fxCardBg}`)
  if (fxBalLabel !== demoBalLabel) errors.push(`bal label mismatch: demo=${demoBalLabel} fixture=${fxBalLabel}`)
  if (fxBalValue !== demoBalValue) errors.push(`bal value mismatch: demo=${demoBalValue} fixture=${fxBalValue}`)
  // gutter target colors per plan
  if (fxGutterBg !== 'rgb(224, 227, 229)') errors.push(`gutter bg mismatch: ${fxGutterBg}`)
  if (fxGutterFg !== 'rgb(188, 201, 198)') errors.push(`gutter fg mismatch: ${fxGutterFg}`)

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
      activeLineGutterCount: document.querySelectorAll('.cm-gutters .cm-activeLineGutter').length,
      deltaOutColor: get('.cm-delta-out', 'color'),
      deltaInColor: get('.cm-delta-in', 'color'),
      pillPaddingRight: get('.cm-balance-pill', 'paddingRight'),
      pillHeight: get('.cm-balance-pill', 'height'),
      headerBalanceFontSize: balanceEl ? window.getComputedStyle(balanceEl).fontSize : null,
      headerBalanceFontFamily: balanceEl ? window.getComputedStyle(balanceEl).fontFamily : null,
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
  if (probes.pillPaddingRight !== '16px') {
    errors.push(`pill paddingRight=${probes.pillPaddingRight} (expected 16px)`)
  }
  if (probes.pillHeight !== '16px') {
    errors.push(`pill height=${probes.pillHeight} (expected 16px)`)
  }
  if (probes.headerBalanceFontSize !== '24px') {
    errors.push(`header balance fontSize=${probes.headerBalanceFontSize} (expected 24px / text-2xl)`)
  }

  // Soft-fail GAPs
  const softFails = []
  if (probes.footerTextTransform === 'uppercase') {
    softFails.push(
      `GAP-2: footer textTransform=uppercase — mock shows lowercase "txns" ; should be 'none'`,
    )
  }
  if (probes.activeLineGutterCount === 0) {
    softFails.push(
      `GAP-3: no .cm-activeLineGutter present (highlightActiveLineGutter disabled) — mock shows teal 2px bar`,
    )
  } else if (probes.activeLineGutterBg !== 'rgb(0, 104, 95)') {
    softFails.push(
      `GAP-3: activeLineGutter bg=${probes.activeLineGutterBg} (expected rgb(0,104,95) #00685f)`,
    )
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

  if (softFails.length > 0) {
    console.warn('SOFT-FAILS (known gaps, logged not gating):')
    for (const w of softFails) console.warn('  -', w)
  }

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

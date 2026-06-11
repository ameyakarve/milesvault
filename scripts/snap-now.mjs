import { chromium } from '@playwright/test'

const URL =
  'http://localhost:6006/iframe.html?id=ledger-per-account-view-fixture--default&viewMode=story'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('.cm-content', { timeout: 10000 })
await page.waitForTimeout(500)
await page.screenshot({ path: '/tmp/now.png', fullPage: false })

const probe = await page.evaluate(() => {
  const headerEl = document.querySelector('[class*="text-2xl"]')
  const footers = Array.from(
    document.querySelectorAll('.cm-balance-footer .cm-bal-value'),
  ).map((e) => (e.textContent || '').trim())
  const deltas = Array.from(document.querySelectorAll('.cm-delta-inlay')).map((e) =>
    (e.textContent || '').trim(),
  )
  const editorBg = (() => {
    const el = document.querySelector('.cm-editor')
    return el ? getComputedStyle(el).backgroundColor : null
  })()
  const cardBgFirst = (() => {
    const el = document.querySelector('.cm-card-bg')
    return el ? getComputedStyle(el).backgroundColor : null
  })()
  const lineCount = document.querySelectorAll('.cm-line').length
  const cardLines =
    document.querySelectorAll('.cm-card-top, .cm-card-mid, .cm-card-bot, .cm-card-solo').length
  const layerEl = document.querySelector('.cm-card-bg-layer')
  const layerInfo = layerEl
    ? {
        markers: layerEl.querySelectorAll('.cm-card-bg').length,
        z: getComputedStyle(layerEl).zIndex,
        pe: getComputedStyle(layerEl).pointerEvents,
      }
    : null
  return {
    header: headerEl?.textContent?.trim() ?? null,
    footers,
    deltas,
    editorBg,
    cardBgFirst,
    lineCount,
    cardLines,
    layerInfo,
  }
})

console.log(JSON.stringify(probe, null, 2))
await browser.close()

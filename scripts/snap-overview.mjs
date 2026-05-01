import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const STORY_URL =
  'http://localhost:6006/iframe.html?id=ledger-per-account-view-fixture--overview&viewMode=story'
const MOCK_HTML = path.resolve('docs/design/overview/bank/screen-v2.html')

const browser = await chromium.launch()

async function snapElement(url, selector, outPath, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const handle = await page.locator(selector).first()
  const box = await handle.boundingBox()
  if (!box) throw new Error(`no bbox for ${selector} on ${url}`)
  await page.screenshot({
    path: outPath,
    clip: { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.floor(box.width), height: Math.floor(box.height) },
  })
  await ctx.close()
  return box
}

const a = await snapElement(STORY_URL, '[data-overview-root]', '/tmp/overview-story.png')
const b = await snapElement('file://' + MOCK_HTML, '[data-overview-root]', '/tmp/overview-mock.png')
console.log('story bbox:', a)
console.log('mock  bbox:', b)
console.log('story:', fs.statSync('/tmp/overview-story.png').size, 'bytes')
console.log('mock :', fs.statSync('/tmp/overview-mock.png').size, 'bytes')

await browser.close()

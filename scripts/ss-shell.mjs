import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 1474 },
  deviceScaleFactor: 2,
})
const page = await ctx.newPage()
await ctx.clearCookies()
await page.goto(
  'http://localhost:6006/iframe.html?id=ledgernew-shell--stitch-v-5&viewMode=story&_=' + Date.now(),
  { waitUntil: 'domcontentloaded' },
)
await page.waitForSelector('.cm-content', { timeout: 15000 })
await page.waitForTimeout(2500)
// click on cashback card body to position cursor inside last entry
const lines = await page.locator('.cm-content .cm-line').all()
if (lines.length >= 4) {
  await lines[lines.length - 4].click({ position: { x: 5, y: 5 } })
}
await page.waitForTimeout(300)
await page.keyboard.press('Meta+i')
await page.waitForTimeout(800)
await page.evaluate(() => {
  const widget = document.querySelector('.cm-ai-widget')
  if (!widget) return
  const response = widget.querySelector('.cm-ai-response')
  if (response instanceof HTMLElement) {
    response.hidden = false
    response.textContent = 'Reclassified the cashback leg under Expenses:Cashback. Review the diff?'
  }
  const undo = widget.querySelector('.cm-ai-undo')
  if (undo instanceof HTMLElement) {
    undo.hidden = false
  }
  const input = widget.querySelector('.cm-ai-input')
  if (input instanceof HTMLInputElement) input.blur()
})
await page.waitForTimeout(300)
await page.screenshot({ path: '/tmp/ss-shell.png', fullPage: true })
console.log('shot ok')
await browser.close()

import { chromium } from '@playwright/test'

const browser = await chromium.launch()

async function check(label, url, isFile) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(isFile ? 'file://' + url : url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  const data = await page.evaluate(() => {
    const img = document.querySelector('img[alt="User Profile"]')
    return img ? { src: img.src.slice(0, 80), complete: img.complete, naturalW: img.naturalWidth, naturalH: img.naturalHeight } : 'no img'
  })
  console.log(label, data)
  await ctx.close()
}

await check('STITCH', '/tmp/nav-option-2.html', true)
await check('HOME', 'http://localhost:6006/iframe.html?id=home-chrome--stitch-parity&viewMode=story', false)
await browser.close()

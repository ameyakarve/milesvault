import { chromium } from '@playwright/test'
const b = await chromium.launch()
for (const theme of ['light', 'dark']) {
  const ctx = await b.newContext({ viewport: { width: 1100, height: 700 } })
  const p = await ctx.newPage()
  await p.addInitScript((t) => localStorage.setItem('theme', t), theme)
  await p.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  await p.screenshot({ path: `/tmp/login-${theme}.png` })
  await ctx.close()
}
await b.close()
console.log('done')

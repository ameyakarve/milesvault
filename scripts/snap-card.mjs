import { chromium } from '@playwright/test'
const stories = ['balanced', 'unbalanced', 'three-posting-split', 'submitting', 'failed', 'done']
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 800, height: 700 } })
const p = await ctx.newPage()
for (const s of stories) {
  await p.goto(`http://localhost:6006/iframe.html?id=chat-drafttransaction--${s}&viewMode=story`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(400)
  await p.screenshot({ path: `/tmp/draft-${s}.png` })
  console.log('saved /tmp/draft-' + s + '.png')
}
// And one interaction: focus account input to show what the dropdown looks like
await p.goto('http://localhost:6006/iframe.html?id=chat-drafttransaction--balanced&viewMode=story', { waitUntil: 'networkidle' })
await p.waitForTimeout(400)
const accountInput = await p.locator('input[placeholder="Account"]').first()
await accountInput.click()
await accountInput.fill('Expenses')
await p.waitForTimeout(300)
await p.screenshot({ path: '/tmp/draft-typeahead.png' })
console.log('saved /tmp/draft-typeahead.png')
await b.close()

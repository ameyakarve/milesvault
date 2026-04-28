import { chromium } from '@playwright/test'

const PORT = process.env.STORYBOOK_PORT || '6006'
const STORYBOOK = `http://localhost:${PORT}`

async function load(page, id) {
  const url = `${STORYBOOK}/iframe.html?id=${id}&viewMode=story`
  const res = await page.goto(url, { waitUntil: 'networkidle' })
  if (!res || !res.ok()) throw new Error(`failed to load ${url}: ${res?.status()}`)
}

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })

  await load(page, 'ledger-per-account-view-fixture--default')
  await page.waitForSelector('.cm-content', { timeout: 10000 })
  await page.waitForFunction(() => document.querySelectorAll('.cm-card-top').length > 0 || document.querySelectorAll('.cm-card-solo').length > 0, null, { timeout: 8000 })

  const counts = await page.evaluate(() => {
    const findText = (re) => {
      const all = Array.from(document.querySelectorAll('*'))
      return all.find((el) => re.test((el.textContent || '').trim()))
    }
    const aside = document.querySelector('aside[class*="w-[320px]"]')
    const aiHeading = aside ? findText(/AI Manuscript Assistant/i) : null
    const saveBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => /save/i.test(b.textContent || ''),
    )
    const headerBalanceEl = document.querySelector('[class*="text-2xl"]')
    const footerSpans = Array.from(document.querySelectorAll('footer span'))
    const txnCountEl = footerSpans.find((s) => /\btxns?\b/i.test(s.textContent || ''))
    return {
      cardTop: document.querySelectorAll('.cm-card-top').length,
      cardMid: document.querySelectorAll('.cm-card-mid').length,
      cardBot: document.querySelectorAll('.cm-card-bot').length,
      cardSolo: document.querySelectorAll('.cm-card-solo').length,
      footers: document.querySelectorAll('.cm-balance-footer').length,
      mismatches: document.querySelectorAll('.cm-balance-mismatch').length,
      gutters: document.querySelectorAll('.cm-gutters').length,
      lineNumbers: Array.from(document.querySelectorAll('.cm-lineNumbers .cm-gutterElement')).map(
        (e) => e.textContent,
      ),
      parseBanner: document.querySelectorAll('[data-testid="parse-error-banner"]').length,
      footerValues: Array.from(
        document.querySelectorAll('.cm-balance-footer .cm-bal-value'),
      ).map((e) => (e.textContent || '').trim()),
      asideExists: !!aside,
      aiHeadingPresent: !!aiHeading,
      deltaInlays: document.querySelectorAll('.cm-delta-inlay').length,
      deltaOuts: document.querySelectorAll('.cm-delta-out').length,
      deltaIns: document.querySelectorAll('.cm-delta-in').length,
      amountOuts: document.querySelectorAll('.cm-amount-out').length,
      amountIns: document.querySelectorAll('.cm-amount-in').length,
      saveBtnHasTeal: !!saveBtn && saveBtn.className.includes('bg-teal-600'),
      saveBtnText: saveBtn ? (saveBtn.textContent || '').trim().replace(/\s+/g, ' ') : null,
      headerBalanceText: headerBalanceEl ? (headerBalanceEl.textContent || '').trim() : null,
      txnCountText: txnCountEl ? (txnCountEl.textContent || '').trim() : null,
    }
  })

  console.log('default story counts:', counts)

  // 8 directives total: open, 3 txns, balance, pad, note, close
  // footers: open(1) + 3 txns(3) + balance(1) + pad(1) + close(1) = 7. note has no footer.
  if (counts.footers !== 7) errors.push(`expected 7 footers, got ${counts.footers}`)
  if (counts.mismatches !== 0) errors.push(`expected 0 mismatches in default fixture, got ${counts.mismatches}`)
  if (counts.gutters < 1) errors.push(`expected built-in gutter visible`)
  if (counts.parseBanner !== 0) errors.push(`expected no parse banner on default fixture`)
  if (!counts.asideExists) errors.push(`expected aside w-[320px] (AI pane) present`)
  if (!counts.aiHeadingPresent) errors.push(`expected "AI Manuscript Assistant" heading inside aside`)
  if (counts.deltaInlays < 3) errors.push(`expected >=3 .cm-delta-inlay (3-txn fixture), got ${counts.deltaInlays}`)
  if (counts.deltaOuts !== 2) errors.push(`expected 2 .cm-delta-out (Coffee + Groceries), got ${counts.deltaOuts}`)
  if (counts.deltaIns !== 1) errors.push(`expected 1 .cm-delta-in (Refund), got ${counts.deltaIns}`)
  if (counts.amountOuts !== 2) errors.push(`expected 2 .cm-amount-out marks, got ${counts.amountOuts}`)
  if (counts.amountIns !== 1) errors.push(`expected 1 .cm-amount-in mark, got ${counts.amountIns}`)
  if (!counts.saveBtnHasTeal) errors.push(`save button missing bg-teal-600 (got "${counts.saveBtnText}")`)

  if (!counts.headerBalanceText) {
    errors.push(`header balance element not found ([class*="text-2xl"])`)
  } else if (!/^-?₹[\d,]+\.\d{2}$/.test(counts.headerBalanceText)) {
    errors.push(
      `header balance "${counts.headerBalanceText}" not in expected format (₹1,32,450.00 or -₹1,250.50)`,
    )
  }
  if (counts.txnCountText !== '3 txns') {
    errors.push(`txn count textContent="${counts.txnCountText}" (expected exact "3 txns")`)
  }
  // Delta texts: no currency suffix, locale-grouped digits
  const deltaTexts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.cm-delta-inlay')).map((e) =>
      (e.textContent || '').replace(/ /g, ' ').trim(),
    ),
  )
  console.log('delta texts:', deltaTexts)
  const deltaPattern = /^→\s*[+−]\d{1,3}(,\d{2,3})*\.\d{2}$/
  for (let i = 0; i < deltaTexts.length; i++) {
    if (!deltaPattern.test(deltaTexts[i])) {
      errors.push(`delta[${i}] "${deltaTexts[i]}" not in "→ ±X,XXX.XX" format`)
    }
  }

  // Display order is now reverse-chronological. Each card's footer shows the
  // running balance after that txn occurred — same value the chronological
  // pass would produce, just laid out newest → oldest:
  //   close   (latest):    -1,250.50
  //   pad:                 -1,250.50
  //   balance (asserts ok):-1,250.50
  //   txn3 (Refund +500):  -1,250.50
  //   txn2 (Groceries):    -1,750.50
  //   txn1 (Coffee -250):    -250.00
  //   open (oldest):           0.00
  const expectedFooters = [
    '-1,250.50',
    '-1,250.50',
    '-1,250.50',
    '-1,250.50',
    '-1,750.50',
    '-250.00',
    '0.00',
  ]
  for (let i = 0; i < expectedFooters.length; i++) {
    if (counts.footerValues[i] !== expectedFooters[i]) {
      errors.push(
        `footer[${i}]: expected ${JSON.stringify(expectedFooters[i])} got ${JSON.stringify(counts.footerValues[i])}`,
      )
    }
  }

  // Type a leading space at the buffer start → strict parse fails → banner appears
  await page.click('.cm-content')
  await page.keyboard.press('Meta+ArrowUp')
  await page.keyboard.type(' ')
  await page.waitForSelector('[data-testid="parse-error-banner"]', { timeout: 8000 })

  const errCounts = await page.evaluate(() => ({
    parseBanner: document.querySelectorAll('[data-testid="parse-error-banner"]').length,
  }))

  console.log('typed-bad-text counts:', errCounts)
  if (errCounts.parseBanner !== 1) errors.push(`expected 1 parse banner after typing bad char, got ${errCounts.parseBanner}`)

  // Prefix-scope story: opening :HSBC must include sub-accounts AND exclude
  // the HSBCBank sibling.
  await load(page, 'ledger-per-account-view-fixture--prefix-scope')
  await page.waitForSelector('.cm-content', { timeout: 10000 })
  await page.waitForFunction(
    () => document.querySelectorAll('.cm-card-top, .cm-card-solo').length > 0,
    null,
    { timeout: 8000 },
  )

  const prefixCounts = await page.evaluate(() => ({
    bufferText: (document.querySelector('.cm-content')?.textContent || '').trim(),
    deltaCount: document.querySelectorAll('.cm-delta-inlay').length,
  }))

  console.log('prefix story buffer (first 400):', prefixCounts.bufferText.slice(0, 400))

  if (!prefixCounts.bufferText.includes('HSBC:Cashback')) {
    errors.push(`prefix-scope: missing sub-account HSBC:Cashback in buffer`)
  }
  if (!prefixCounts.bufferText.includes('HSBC:Rewards')) {
    errors.push(`prefix-scope: missing sub-account HSBC:Rewards in buffer`)
  }
  if (prefixCounts.bufferText.includes('HSBCBank')) {
    errors.push(`prefix-scope: sibling HSBCBank leaked into :HSBC view`)
  }
  if (prefixCounts.bufferText.includes('9999.00')) {
    errors.push(`prefix-scope: sibling amount 9999.00 leaked into :HSBC view`)
  }
  // 3 in-scope txns (HSBC, HSBC:Cashback, HSBC:Rewards) → 3 delta inlays.
  if (prefixCounts.deltaCount !== 3) {
    errors.push(`prefix-scope: expected 3 delta inlays, got ${prefixCounts.deltaCount}`)
  }

  await browser.close()

  if (errors.length > 0) {
    console.error('VERIFY FAILED:')
    for (const e of errors) console.error('  -', e)
    process.exit(1)
  }
  console.log('VERIFY OK')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

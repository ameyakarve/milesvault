import { chromium } from '@playwright/test'

const PORT = process.env.STORYBOOK_PORT || '6006'
const URL = `http://localhost:${PORT}/iframe.html?id=ledger-per-account-view-fixture--default&viewMode=story`

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const res = await page.goto(URL, { waitUntil: 'networkidle' })
if (!res || !res.ok()) throw new Error(`failed ${URL}: ${res?.status()}`)
await page.waitForSelector('.cm-content', { timeout: 8000 })
await page.waitForFunction(() => document.querySelectorAll('.cm-card-bg').length >= 3, {
  timeout: 8000,
})

const errors = []
const fail = (msg) => errors.push(msg)
const expectEq = (label, actual, expected) => {
  if (actual !== expected) fail(`${label}: ${actual} (expected ${expected})`)
}

const probes = await page.evaluate(() => {
  const cs = (el) => (el ? window.getComputedStyle(el) : null)
  const text = (el) => (el ? el.textContent.trim() : null)
  const rect = (el) => (el ? el.getBoundingClientRect() : null)
  const all = (sel) => Array.from(document.querySelectorAll(sel))

  const shell = document.querySelector('.flex-1.flex.flex-col.min-w-0')
  const splitNode = shell?.children[0]
  const editorCol = splitNode?.querySelector('main')
  const aside = splitNode?.querySelector('aside')

  const row1Node = editorCol?.children[0]
  const row2Node = editorCol?.children[1]
  const row3Node = editorCol?.children[2]
  const subToolbar = editorCol?.children[3]
  const editorBody = editorCol?.children[4]

  const statTiles = row2Node ? Array.from(row2Node.querySelectorAll(':scope > div > div')) : []
  const tile = (label) =>
    statTiles.find((t) => /^(BALANCE|NET IN|NET OUT)$/i.test(t.children[0]?.textContent || '')) ?
      statTiles.find((t) => t.children[0]?.textContent?.toUpperCase() === label) : null
  const balanceTile = tile('BALANCE')
  const netInTile = tile('NET IN')
  const netOutTile = tile('NET OUT')

  const balanceVal = balanceTile?.children[1]
  const netInVal = netInTile?.children[1]
  const netOutVal = netOutTile?.children[1]

  // Row 3 chips
  const chipBtns = row3Node ? Array.from(row3Node.querySelectorAll('button')) : []
  const allChip = chipBtns[0]
  const exploreLink = chipBtns[chipBtns.length - 1]

  // Sub-toolbar tabs
  const tabBtns = subToolbar ? Array.from(subToolbar.querySelectorAll('button')) : []
  const editorTab = tabBtns.find((b) => b.textContent.trim() === 'Editor')
  const statementTab = tabBtns.find((b) => b.textContent.trim() === 'Statement')

  // AI pane
  const aiTitle = aside?.querySelector('h2')

  return {
    row1: {
      height: row1Node ? rect(row1Node).height : null,
      bg: cs(row1Node)?.backgroundColor,
      borderBottomColor: cs(row1Node)?.borderBottomColor,
      borderBottomWidth: cs(row1Node)?.borderBottomWidth,
    },
    row2: {
      height: row2Node ? rect(row2Node).height : null,
      bg: cs(row2Node)?.backgroundColor,
    },
    row3: {
      height: row3Node ? rect(row3Node).height : null,
      bg: cs(row3Node)?.backgroundColor,
    },
    subToolbar: {
      height: subToolbar ? rect(subToolbar).height : null,
      bg: cs(subToolbar)?.backgroundColor,
      borderBottomColor: cs(subToolbar)?.borderBottomColor,
      borderBottomWidth: cs(subToolbar)?.borderBottomWidth,
    },
    aiPane: {
      width: aside ? rect(aside).width : null,
      bg: cs(aside)?.backgroundColor,
      borderLeftColor: cs(aside)?.borderLeftColor,
      titleTop: aiTitle ? rect(aiTitle).top : null,
      paneTop: aside ? rect(aside).top : null,
      paneLeft: aside ? rect(aside).left : null,
      row1Right: row1Node ? rect(row1Node).right : null,
      row1Top: row1Node ? rect(row1Node).top : null,
    },
    stats: {
      balanceColor: cs(balanceVal)?.color,
      balanceFontFamily: cs(balanceVal)?.fontFamily,
      balanceFontSize: cs(balanceVal)?.fontSize,
      balanceFontWeight: cs(balanceVal)?.fontWeight,
      balanceText: text(balanceVal),
      netInColor: cs(netInVal)?.color,
      netInText: text(netInVal),
      netOutColor: cs(netOutVal)?.color,
      netOutText: text(netOutVal),
    },
    chips: {
      allChipBg: cs(allChip)?.backgroundColor,
      allChipColor: cs(allChip)?.color,
      allChipText: text(allChip),
      exploreColor: cs(exploreLink)?.color,
    },
    tabs: {
      editorActive: editorTab?.className.includes('border-teal-600'),
      editorColor: cs(editorTab)?.color,
      editorFontWeight: cs(editorTab)?.fontWeight,
      statementColor: cs(statementTab)?.color,
    },
  }
})

console.log(JSON.stringify(probes, null, 2))

// Row 1
expectEq('row1 height', probes.row1.height, 32)
expectEq('row1 bg', probes.row1.bg, 'rgb(255, 255, 255)')
expectEq('row1 borderBottomWidth', probes.row1.borderBottomWidth, '1px')
// slate-50 = rgb(248, 250, 252)
expectEq('row1 borderBottomColor', probes.row1.borderBottomColor, 'rgb(248, 250, 252)')

// Row 2
expectEq('row2 height', probes.row2.height, 64)
expectEq('row2 bg', probes.row2.bg, 'rgb(255, 255, 255)')

// Row 3
expectEq('row3 height', probes.row3.height, 44)
// surface-container-low = #f2f4f6 = rgb(242, 244, 246)
expectEq('row3 bg', probes.row3.bg, 'rgb(242, 244, 246)')

// Sub-toolbar
expectEq('subToolbar height', probes.subToolbar.height, 40)
// surface-container = #eceef0 = rgb(236, 238, 240)
expectEq('subToolbar bg', probes.subToolbar.bg, 'rgb(236, 238, 240)')
expectEq('subToolbar borderBottomWidth', probes.subToolbar.borderBottomWidth, '1px')
// slate-200 = rgb(226, 232, 240)
expectEq('subToolbar borderBottomColor', probes.subToolbar.borderBottomColor, 'rgb(226, 232, 240)')

// AI pane (v9: spans from y=0 alongside Row 1, not below it)
expectEq('aiPane width', probes.aiPane.width, 320)
// slate-50 = rgb(248, 250, 252)
expectEq('aiPane bg', probes.aiPane.bg, 'rgb(248, 250, 252)')
// AI pane top must equal Row 1 top (both flush with viewport top of split region)
if (probes.aiPane.paneTop == null || probes.aiPane.row1Top == null) {
  fail('aiPane top or row1 top not measured')
} else if (Math.abs(probes.aiPane.paneTop - probes.aiPane.row1Top) > 1) {
  fail(
    `aiPane top=${probes.aiPane.paneTop} differs from row1 top=${probes.aiPane.row1Top} (expected aligned)`,
  )
}
// AI title sits inside its pane, near the top (~16px py-4 padding)
if (probes.aiPane.titleTop == null || probes.aiPane.paneTop == null) {
  fail('aiPane title or pane top not measured')
} else {
  const gap = probes.aiPane.titleTop - probes.aiPane.paneTop
  if (gap < 0 || gap > 32) {
    fail(`aiPane title gap from pane top = ${gap}px (expected within 0..32)`)
  }
}
// Row 1 must end at or before AI pane left edge (Row 1 scoped to editor column)
if (probes.aiPane.row1Right == null || probes.aiPane.paneLeft == null) {
  fail('row1 right or aiPane left not measured')
} else if (probes.aiPane.row1Right > probes.aiPane.paneLeft + 1) {
  fail(
    `row1 right=${probes.aiPane.row1Right} extends past aiPane left=${probes.aiPane.paneLeft} (expected row1 to stop at editor column edge)`,
  )
}

// Stats
// slate-900 = rgb(15, 23, 42); teal #00685f = rgb(0, 104, 95); rose-600 = rgb(225, 29, 72)
expectEq('balance color', probes.stats.balanceColor, 'rgb(15, 23, 42)')
expectEq('netIn color', probes.stats.netInColor, 'rgb(0, 104, 95)')
expectEq('netOut color', probes.stats.netOutColor, 'rgb(225, 29, 72)')
if (!/JetBrains Mono/.test(probes.stats.balanceFontFamily || '')) {
  fail(`balance fontFamily=${probes.stats.balanceFontFamily}`)
}
expectEq('balance fontSize', probes.stats.balanceFontSize, '24px')
expectEq('balance fontWeight', probes.stats.balanceFontWeight, '700')

// Chips
// teal-600 from CSS framework: bg-[#00685f]
expectEq('all-chip bg', probes.chips.allChipBg, 'rgb(0, 104, 95)')
expectEq('all-chip color', probes.chips.allChipColor, 'rgb(255, 255, 255)')
if (!/^All/.test(probes.chips.allChipText || '')) {
  fail(`all-chip text=${probes.chips.allChipText}`)
}
expectEq('explore link color', probes.chips.exploreColor, 'rgb(0, 104, 95)')

// Tabs
if (!probes.tabs.editorActive) fail('Editor tab missing border-teal-600 active class')
expectEq('editor tab color', probes.tabs.editorColor, 'rgb(15, 23, 42)')
expectEq('editor tab fontWeight', probes.tabs.editorFontWeight, '700')
expectEq('statement tab color', probes.tabs.statementColor, 'rgb(100, 116, 139)')

await browser.close()

if (errors.length > 0) {
  console.error('\nVERIFY FAILED:')
  for (const e of errors) console.error('  -', e)
  process.exit(1)
}
console.log('\nV8 LAYOUT VERIFY OK')

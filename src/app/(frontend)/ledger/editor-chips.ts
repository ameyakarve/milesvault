import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, type DecorationSet, type EditorView } from '@codemirror/view'
import {
  chipSlotWidth,
  chipVisualWidth,
  type Glyph,
  resolveAccount,
  type ResolvedAccount,
} from '@/lib/beancount/entities'
import { ChipWidget } from './chip-widget'
import { chipSuppressContext, isChipSuppressed } from './editor-chip-state'
import {
  cachedParse,
  isInVisibleRange,
  makeChipPlugin,
  makeChipTooltip,
  postingAmountStartMap,
  postingSignMap,
} from './parse-cache'

type Hit = {
  from: number
  to: number
  glyph: Glyph
  chipLabel: string
  tooltip: string
}

const POINTS_PATH = 'Assets:Rewards:Points'
const STATUS_PATH = 'Assets:Rewards:Status'
const EXPENSES_VOID_PATH = 'Expenses:Void'
const INCOME_VOID_PATH = 'Income:Void'
const CC_PATH = 'Liabilities:CC'
const BANK_PATH = 'Assets:Bank'
const GIFT_CARDS_PATH = 'Assets:Loaded:GiftCards'
const FOREX_CARDS_PATH = 'Assets:Loaded:ForexCards'
const PREPAID_CARDS_PATH = 'Assets:Loaded:PrepaidCards'
const WALLETS_PATH = 'Assets:Loaded:Wallets'
const DC_PATH = 'Assets:DC'
const UPI_PATH = 'Assets:UPI'
const CASH_PATH = 'Assets:Cash'

function hitFor(
  acct: string,
  start: number,
  signByAcctPos: Map<number, number>,
  amountStartByAcctPos: Map<number, number>,
): Hit | null {
  const r = resolveAccount(acct)
  if (!r || !r.glyph) return null
  const chipLabel = signAwareLabel(r, signByAcctPos.get(start))
  const rawEnd = start + r.consumedLen
  const overflows = chipVisualWidth(chipLabel) > r.consumedLen
  const to = overflows ? (amountStartByAcctPos.get(start) ?? rawEnd) : rawEnd
  return {
    from: start,
    to,
    glyph: r.glyph,
    chipLabel,
    tooltip: tooltipFor(acct, r),
  }
}

function signAwareLabel(r: ResolvedAccount, sign: number | undefined): string {
  if (r.matchedPath === EXPENSES_VOID_PATH || r.matchedPath === INCOME_VOID_PATH) {
    if (sign !== undefined && sign !== 0) return 'Balancing entry for bookkeeping'
    return r.chipLabel
  }
  if (r.matchedPath.startsWith('Expenses:')) {
    return `Spend on ${r.chipLabel}`
  }
  if (r.matchedPath === CC_PATH) {
    if (sign !== undefined && sign > 0) return `Credited to ${r.chipLabel} CC`
    return `Paid using ${r.chipLabel} CC`
  }
  if (r.matchedPath === DC_PATH) {
    if (sign !== undefined && sign > 0) return `Credited to ${r.chipLabel} DC`
    return `Paid using ${r.chipLabel} DC`
  }
  if (r.matchedPath === UPI_PATH) {
    if (sign !== undefined && sign > 0) return `Credited to ${r.chipLabel} UPI`
    return `Paid using ${r.chipLabel} UPI`
  }
  if (r.matchedPath === CASH_PATH) {
    if (sign !== undefined && sign > 0) return `Credited to Cash`
    return `Paid in Cash`
  }
  if (r.matchedPath === FOREX_CARDS_PATH && r.tail.length > 0) {
    const brand = r.tail.join(' ')
    if (sign !== undefined && sign > 0) return `Credited to ${brand} Forex card`
    return `Paid using ${brand} Forex card`
  }
  if (r.matchedPath === PREPAID_CARDS_PATH && r.tail.length > 0) {
    const brand = r.tail.join(' ')
    if (sign !== undefined && sign > 0) return `Credited to ${brand} prepaid card`
    return `Paid using ${brand} prepaid card`
  }
  if (r.matchedPath === WALLETS_PATH && r.tail.length > 0) {
    const brand = r.tail.join(' ')
    if (sign !== undefined && sign > 0) return `Credited to ${brand} wallet`
    return `Paid using ${brand} wallet`
  }
  if (r.matchedPath === GIFT_CARDS_PATH && r.tail.length > 0) {
    const base = `${r.tail.join(' ')} gift card`
    if (sign === undefined || sign === 0) return base
    return `${base} ${sign > 0 ? 'credited' : 'debited'}`
  }
  if (sign === undefined || sign === 0) return r.chipLabel
  if (r.matchedPath === POINTS_PATH && r.tail.length > 0) {
    return `${r.chipLabel} ${sign > 0 ? 'earned' : 'burned'}`
  }
  if (r.matchedPath === STATUS_PATH && r.tail.length > 0) {
    return `${r.tail.join(':')} Status: ${sign > 0 ? 'earned' : 'expired'}`
  }
  if (r.matchedPath === BANK_PATH && r.tail.length > 0) {
    if (sign > 0) return `Credited to ${r.chipLabel}`
    return `Debited from ${r.chipLabel}`
  }
  return r.chipLabel
}

function tooltipFor(acct: string, r: ResolvedAccount): string {
  return r.tail.length === 0 ? r.matchedPath : acct
}

function findAccountHits(view: EditorView): Hit[] {
  const parse = cachedParse(view.state.doc)
  const signs = postingSignMap(parse)
  const amountStarts = postingAmountStartMap(parse)
  const hits: Hit[] = []
  for (const a of parse.accounts) {
    if (!isInVisibleRange(view, a.range.from)) continue
    const hit = hitFor(a.account, a.range.from, signs, amountStarts)
    if (hit) hits.push(hit)
  }
  return hits
}

function buildChipDecorations(view: EditorView): DecorationSet {
  const skip = chipSuppressContext(view.state)
  const hits = findAccountHits(view).sort((a, b) => a.from - b.from)
  const builder = new RangeSetBuilder<Decoration>()
  for (const h of hits) {
    if (isChipSuppressed(skip, h)) continue
    builder.add(
      h.from,
      h.to,
      Decoration.replace({
        widget: new ChipWidget({
          variant: 'account',
          label: h.chipLabel,
          tooltip: h.tooltip,
          svg: h.glyph.svg,
          width: chipSlotWidth(h.to - h.from, h.chipLabel),
        }),
      }),
    )
  }
  return builder.finish()
}

export const accountChips = makeChipPlugin(buildChipDecorations)

function hitAtPos(view: EditorView, pos: number): Hit | null {
  const parse = cachedParse(view.state.doc)
  const signs = postingSignMap(parse)
  const amountStarts = postingAmountStartMap(parse)
  for (const a of parse.accounts) {
    const hit = hitFor(a.account, a.range.from, signs, amountStarts)
    if (!hit) continue
    if (pos >= hit.from && pos < hit.to) return hit
  }
  return null
}

export const accountChipTooltip = makeChipTooltip(hitAtPos)

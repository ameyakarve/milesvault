import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, type DecorationSet, type EditorView } from '@codemirror/view'
import {
  chipSlotWidth,
  type Glyph,
  resolveAccount,
  type ResolvedAccount,
} from '@/lib/beancount/entities'
import { ChipWidget } from './chip-widget'
import { cursorPos } from './editor-chip-state'
import {
  cachedParse,
  isInVisibleRange,
  makeChipPlugin,
  makeChipTooltip,
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

function hitFor(acct: string, start: number, signByAcctPos: Map<number, number>): Hit | null {
  const r = resolveAccount(acct)
  if (!r || !r.glyph) return null
  return {
    from: start,
    to: start + r.consumedLen,
    glyph: r.glyph,
    chipLabel: signAwareLabel(r, signByAcctPos.get(start)),
    tooltip: tooltipFor(acct, r),
  }
}

function signAwareLabel(r: ResolvedAccount, sign: number | undefined): string {
  if (sign === undefined || sign === 0 || r.tail.length === 0) return r.chipLabel
  if (r.matchedPath === POINTS_PATH) {
    return `${r.chipLabel} ${sign > 0 ? 'earned' : 'burned'}`
  }
  if (r.matchedPath === STATUS_PATH) {
    return `${r.tail.join(':')} Status: ${sign > 0 ? 'earned' : 'expired'}`
  }
  return r.chipLabel
}

function tooltipFor(acct: string, r: ResolvedAccount): string {
  return r.tail.length === 0 ? r.matchedPath : acct
}

function findAccountHits(view: EditorView): Hit[] {
  const parse = cachedParse(view.state.doc)
  const signs = postingSignMap(parse)
  const hits: Hit[] = []
  for (const a of parse.accounts) {
    if (!isInVisibleRange(view, a.range.from)) continue
    const hit = hitFor(a.account, a.range.from, signs)
    if (hit) hits.push(hit)
  }
  return hits
}

function buildChipDecorations(view: EditorView): DecorationSet {
  const cursor = cursorPos(view.state)
  const hits = findAccountHits(view).sort((a, b) => a.from - b.from)
  const builder = new RangeSetBuilder<Decoration>()
  for (const h of hits) {
    if (cursor >= h.from && cursor <= h.to) continue
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
  for (const a of parse.accounts) {
    const hit = hitFor(a.account, a.range.from, signs)
    if (!hit) continue
    if (pos >= hit.from && pos < hit.to) return hit
  }
  return null
}

export const accountChipTooltip = makeChipTooltip(hitAtPos)

import type { Text } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  hoverTooltip,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import { parseBuffer, type ParseResult } from '@/lib/beancount/parse'

const parseCache = new WeakMap<Text, ParseResult>()

export function cachedParse(doc: Text): ParseResult {
  let hit = parseCache.get(doc)
  if (!hit) {
    hit = parseBuffer(doc.toString())
    parseCache.set(doc, hit)
  }
  return hit
}

export function isInVisibleRange(view: EditorView, pos: number): boolean {
  for (const { from, to } of view.visibleRanges) {
    if (pos >= from && pos <= to) return true
  }
  return false
}

const signMapCache = new WeakMap<ParseResult, Map<number, number>>()

export function postingSignMap(parse: ParseResult): Map<number, number> {
  let m = signMapCache.get(parse)
  if (!m) {
    m = new Map()
    for (const txn of parse.entries) {
      for (const p of txn.postings) {
        if (!p.amount) continue
        const n = parseFloat(p.amount.numberText)
        if (!Number.isFinite(n)) continue
        m.set(p.accountRange.from, Math.sign(n))
      }
    }
    signMapCache.set(parse, m)
  }
  return m
}

const amountStartMapCache = new WeakMap<ParseResult, Map<number, number>>()

export function postingAmountStartMap(parse: ParseResult): Map<number, number> {
  let m = amountStartMapCache.get(parse)
  if (!m) {
    m = new Map()
    for (const txn of parse.entries) {
      for (const p of txn.postings) {
        if (!p.amount) continue
        m.set(p.accountRange.from, p.amount.range.from)
      }
    }
    amountStartMapCache.set(parse, m)
  }
  return m
}

export function makeChipPlugin(build: (view: EditorView) => DecorationSet) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = build(view)
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || u.selectionSet) {
          this.decorations = build(u.view)
        }
      }
    },
    {
      decorations: (v) => v.decorations,
      provide: (plugin) =>
        EditorView.atomicRanges.of(
          (view) => view.plugin(plugin)?.decorations ?? Decoration.none,
        ),
    },
  )
}

type ChipTooltipHit = { from: number; to: number; tooltip: string }

export function makeChipTooltip<H extends ChipTooltipHit>(
  hitAt: (view: EditorView, pos: number) => H | null,
) {
  return hoverTooltip(
    (view, pos) => {
      const hit = hitAt(view, pos)
      if (!hit) return null
      return {
        pos: hit.from,
        end: hit.to,
        above: true,
        create: () => {
          const dom = document.createElement('div')
          dom.className = 'cm-chip-tip'
          dom.textContent = hit.tooltip
          return { dom }
        },
      }
    },
    { hoverTime: 120 },
  )
}

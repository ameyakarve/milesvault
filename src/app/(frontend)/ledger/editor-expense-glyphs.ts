import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  hoverTooltip,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import { CATEGORY_ICON_SVG, toChipSvg } from '@/lib/beancount/category-icon-svgs'
import { chipVisualWidth, matchExpenseChip } from '@/lib/beancount/glyphs'

type ExpenseHit = {
  from: number
  to: number
  svg: string
  label: string
  tooltipPath: string
}

const ACCOUNT_RE = /Expenses(?::[A-Za-z0-9]+)+/g

function findExpenseHits(view: EditorView): ExpenseHit[] {
  const hits: ExpenseHit[] = []
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to)
    for (const match of text.matchAll(ACCOUNT_RE)) {
      const acctText = match[0]
      const chip = matchExpenseChip(acctText)
      if (!chip) continue
      const svg = CATEGORY_ICON_SVG[chip.matchedPath]
      if (!svg) continue
      const start = from + (match.index ?? 0)
      const segments = acctText.split(':')
      const matchedDepth = chip.matchedPath.split(':').length
      const isExact = matchedDepth === segments.length
      const tooltipPath = isExact
        ? chip.matchedPath
        : segments.slice(0, matchedDepth + 1).join(':')
      hits.push({
        from: start,
        to: start + chip.consumedLen,
        svg,
        label: chip.chipLabel,
        tooltipPath,
      })
    }
  }
  return hits
}

class ExpenseGlyphWidget extends WidgetType {
  constructor(
    readonly svg: string,
    readonly label: string,
    readonly tooltipPath: string,
  ) {
    super()
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-account-glyph'
    span.style.width = `${chipVisualWidth(this.label)}ch`
    span.setAttribute('aria-label', this.tooltipPath)
    span.innerHTML = toChipSvg(this.svg)
    const label = document.createElement('span')
    label.className = 'cm-account-glyph-chip'
    label.textContent = this.label
    span.appendChild(label)
    return span
  }
  eq(other: WidgetType): boolean {
    return (
      other instanceof ExpenseGlyphWidget &&
      other.label === this.label &&
      other.tooltipPath === this.tooltipPath &&
      other.svg === this.svg
    )
  }
  ignoreEvent(): boolean {
    return false
  }
}

function buildExpenseDecorations(view: EditorView): DecorationSet {
  const hits = findExpenseHits(view).sort((a, b) => a.from - b.from)
  const builder = new RangeSetBuilder<Decoration>()
  for (const h of hits) {
    builder.add(
      h.from,
      h.to,
      Decoration.replace({
        widget: new ExpenseGlyphWidget(h.svg, h.label, h.tooltipPath),
      }),
    )
  }
  return builder.finish()
}

export const expenseGlyphs = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildExpenseDecorations(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) {
        this.decorations = buildExpenseDecorations(u.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => {
        return view.plugin(plugin)?.decorations ?? Decoration.none
      }),
  },
)

export const expenseGlyphTooltip = hoverTooltip(
  (view, pos) => {
    const hits = findExpenseHits(view)
    const hit = hits.find((h) => pos >= h.from && pos < h.to)
    if (!hit) return null
    return {
      pos: hit.from,
      end: hit.to,
      above: true,
      create: () => {
        const dom = document.createElement('div')
        dom.className = 'cm-account-glyph-tip'
        dom.textContent = hit.tooltipPath
        return { dom }
      },
    }
  },
  { hoverTime: 120 },
)

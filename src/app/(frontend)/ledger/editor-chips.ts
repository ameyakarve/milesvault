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
import {
  ANY_ACCOUNT_RE,
  chipSlotWidth,
  type Glyph,
  resolveAccount,
  type ResolvedAccount,
  toChipSvg,
} from '@/lib/beancount/entities'
import { cursorPos, unveilChipAt } from './editor-chip-state'

type Hit = {
  from: number
  to: number
  glyph: Glyph
  chipLabel: string
  tooltip: string
}

function hitFor(acct: string, start: number): Hit | null {
  const r = resolveAccount(acct)
  if (!r || !r.glyph) return null
  return {
    from: start,
    to: start + r.consumedLen,
    glyph: r.glyph,
    chipLabel: r.chipLabel,
    tooltip: tooltipFor(acct, r),
  }
}

function tooltipFor(acct: string, r: ResolvedAccount): string {
  return r.tail.length === 0 ? r.matchedPath : acct
}

function findAccountHits(view: EditorView): Hit[] {
  const hits: Hit[] = []
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to)
    for (const match of text.matchAll(ANY_ACCOUNT_RE)) {
      const start = from + (match.index ?? 0)
      const hit = hitFor(match[0], start)
      if (hit) hits.push(hit)
    }
  }
  return hits
}

class AccountChipWidget extends WidgetType {
  constructor(
    readonly glyph: Glyph,
    readonly chipLabel: string,
    readonly tooltip: string,
    readonly width: number,
  ) {
    super()
  }
  toDOM(view: EditorView): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-account-glyph'
    span.style.width = `${this.width}ch`
    span.setAttribute('aria-label', this.tooltip)
    span.innerHTML = toChipSvg(this.glyph.svg)
    const label = document.createElement('span')
    label.className = 'cm-account-glyph-chip'
    label.textContent = this.chipLabel
    span.appendChild(label)
    span.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const pos = view.posAtDOM(span)
      unveilChipAt(view, pos)
    })
    return span
  }
  eq(other: WidgetType): boolean {
    return (
      other instanceof AccountChipWidget &&
      other.glyph.svg === this.glyph.svg &&
      other.chipLabel === this.chipLabel &&
      other.tooltip === this.tooltip &&
      other.width === this.width
    )
  }
  ignoreEvent(): boolean {
    return false
  }
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
        widget: new AccountChipWidget(
          h.glyph,
          h.chipLabel,
          h.tooltip,
          chipSlotWidth(h.to - h.from, h.chipLabel),
        ),
      }),
    )
  }
  return builder.finish()
}

export const accountChips = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildChipDecorations(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet) {
        this.decorations = buildChipDecorations(u.view)
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

function hitAtPos(view: EditorView, pos: number): Hit | null {
  const line = view.state.doc.lineAt(pos)
  const localPos = pos - line.from
  for (const match of line.text.matchAll(ANY_ACCOUNT_RE)) {
    const idx = match.index ?? 0
    const hit = hitFor(match[0], line.from + idx)
    if (!hit) continue
    if (localPos >= idx && localPos < idx + (hit.to - hit.from)) return hit
  }
  return null
}

export const accountChipTooltip = hoverTooltip(
  (view, pos) => {
    const hit = hitAtPos(view, pos)
    if (!hit) return null
    return {
      pos: hit.from,
      end: hit.to,
      above: true,
      create: () => {
        const dom = document.createElement('div')
        dom.className = 'cm-account-glyph-tip'
        dom.textContent = hit.tooltip
        return { dom }
      },
    }
  },
  { hoverTime: 120 },
)

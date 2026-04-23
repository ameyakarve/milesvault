import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import { ACCOUNT_GLYPHS, type AccountGlyph } from '@/lib/beancount/glyphs'

const CC_GLYPH_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>'

const GLYPH_SVG: Record<string, string> = {
  'Liabilities:CC': CC_GLYPH_SVG,
}

class AccountGlyphWidget extends WidgetType {
  constructor(readonly glyph: AccountGlyph) {
    super()
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-account-glyph'
    span.style.width = `${this.glyph.visualWidth}ch`
    span.setAttribute('aria-label', this.glyph.text)
    span.title = this.glyph.text
    span.innerHTML = GLYPH_SVG[this.glyph.text] ?? ''
    return span
  }
  eq(other: WidgetType): boolean {
    return other instanceof AccountGlyphWidget && other.glyph.text === this.glyph.text
  }
  ignoreEvent(): boolean {
    return false
  }
}

function buildGlyphDecorations(view: EditorView): DecorationSet {
  type Hit = { from: number; to: number; glyph: AccountGlyph }
  const hits: Hit[] = []
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to)
    for (const glyph of ACCOUNT_GLYPHS) {
      if (!GLYPH_SVG[glyph.text]) continue
      let idx = 0
      while ((idx = text.indexOf(glyph.text, idx)) !== -1) {
        hits.push({ from: from + idx, to: from + idx + glyph.text.length, glyph })
        idx += glyph.text.length
      }
    }
  }
  hits.sort((a, b) => a.from - b.from)
  const builder = new RangeSetBuilder<Decoration>()
  for (const h of hits) {
    builder.add(h.from, h.to, Decoration.replace({ widget: new AccountGlyphWidget(h.glyph) }))
  }
  return builder.finish()
}

export const accountGlyphs = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildGlyphDecorations(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) {
        this.decorations = buildGlyphDecorations(u.view)
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

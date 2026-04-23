import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'

const CC_GLYPH_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>'

class LiabCCWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-liab-cc-glyph'
    span.setAttribute('aria-label', 'Liabilities:CC')
    span.title = 'Liabilities:CC'
    span.innerHTML = CC_GLYPH_SVG
    return span
  }
  eq(other: WidgetType): boolean {
    return other instanceof LiabCCWidget
  }
  ignoreEvent(): boolean {
    return false
  }
}

const LIAB_CC = 'Liabilities:CC'

function buildGlyphDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to)
    let idx = 0
    while ((idx = text.indexOf(LIAB_CC, idx)) !== -1) {
      const start = from + idx
      const end = start + LIAB_CC.length
      builder.add(
        start,
        end,
        Decoration.replace({ widget: new LiabCCWidget() }),
      )
      idx += LIAB_CC.length
    }
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

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

const SVG_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">'
const SVG_CLOSE = '</svg>'

const CARD_LABEL_ATTRS =
  'text-anchor="middle" font-size="10" font-weight="700" stroke="none" fill="currentColor" font-family="ui-monospace, monospace"'
const FX_LABEL_ATTRS =
  'text-anchor="middle" font-size="8" font-weight="700" stroke="none" fill="currentColor" font-family="ui-monospace, monospace"'

const CC_GLYPH_SVG = `${SVG_OPEN}<rect width="20" height="14" x="2" y="5" rx="2"/><text x="12" y="16" ${CARD_LABEL_ATTRS}>CC</text>${SVG_CLOSE}`
const DC_GLYPH_SVG = `${SVG_OPEN}<rect width="20" height="14" x="2" y="5" rx="2" stroke-dasharray="2.5 2"/><text x="12" y="16" ${CARD_LABEL_ATTRS}>DC</text>${SVG_CLOSE}`
const PREPAID_GLYPH_SVG = `${SVG_OPEN}<rect width="20" height="14" x="2" y="5" rx="2"/><text x="12" y="16" ${CARD_LABEL_ATTRS}>PP</text>${SVG_CLOSE}`
const FOREX_GLYPH_SVG = `${SVG_OPEN}<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/><text x="9" y="15" ${FX_LABEL_ATTRS}>$</text><text x="15" y="15" ${FX_LABEL_ATTRS}>€</text>${SVG_CLOSE}`
const BANK_GLYPH_SVG = `${SVG_OPEN}<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>${SVG_CLOSE}`
const POINTS_GLYPH_SVG = `${SVG_OPEN}<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>${SVG_CLOSE}`
const WALLET_GLYPH_SVG = `${SVG_OPEN}<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>${SVG_CLOSE}`
const GIFT_GLYPH_SVG = `${SVG_OPEN}<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>${SVG_CLOSE}`
const RECEIVABLE_GLYPH_SVG = `${SVG_OPEN}<path d="M11 17a1 1 0 0 1-1.414 0L6 13.414A2 2 0 0 1 6 10.586l3.586-3.586a1 1 0 1 1 1.414 1.414L8.414 11H17a4 4 0 0 1 4 4v2a1 1 0 1 1-2 0v-2a2 2 0 0 0-2-2H8.414l2.586 2.586A1 1 0 0 1 11 17Z"/>${SVG_CLOSE}`
const CASH_GLYPH_SVG = `${SVG_OPEN}<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01"/><path d="M18 12h.01"/>${SVG_CLOSE}`
const VOID_GLYPH_SVG = `${SVG_OPEN}<circle cx="12" cy="12" r="8" stroke-dasharray="3 2.5"/>${SVG_CLOSE}`

const GLYPH_SVG: Record<string, string> = {
  'Liabilities:CC:': CC_GLYPH_SVG,
  'Assets:DC:': DC_GLYPH_SVG,
  'Assets:Loaded:PrepaidCards:': PREPAID_GLYPH_SVG,
  'Assets:Loaded:ForexCards:': FOREX_GLYPH_SVG,
  'Assets:Bank:': BANK_GLYPH_SVG,
  'Assets:Rewards:Points:': POINTS_GLYPH_SVG,
  'Assets:Loaded:Wallets:': WALLET_GLYPH_SVG,
  'Assets:Loaded:GiftCards:': GIFT_GLYPH_SVG,
  'Assets:Receivables:': RECEIVABLE_GLYPH_SVG,
  'Assets:Cash': CASH_GLYPH_SVG,
  'Income:Void': VOID_GLYPH_SVG,
  'Expenses:Void': VOID_GLYPH_SVG,
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

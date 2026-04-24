import { RangeSetBuilder, StateField, type Text } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  GutterMarker,
  gutterWidgetClass,
  WidgetType,
} from '@codemirror/view'
import { generateTxnDescription } from '@/lib/beancount/txn-description'
import { cachedParse } from './parse-cache'
import { pickCategoryIcon, renderIconSVG } from './editor-txn-icon'

class TxnDescGutterMarker extends GutterMarker {
  elementClass = 'cm-txn-desc-gutter'
}
const descGutterMarker = new TxnDescGutterMarker()

class TxnDescWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly iconKey: string | null,
  ) {
    super()
  }
  toDOM(): HTMLElement {
    const div = document.createElement('div')
    div.className = 'cm-txn-desc'
    div.innerHTML = `<span class="cm-txn-desc-icon-slot">${renderIconSVG(this.iconKey)}</span><span class="cm-txn-desc-text">${escapeHtml(this.text)}</span>`
    return div
  }
  eq(other: WidgetType): boolean {
    return (
      other instanceof TxnDescWidget &&
      other.text === this.text &&
      other.iconKey === this.iconKey
    )
  }
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c] ?? c,
  )
}

function buildTxnDescs(doc: Text): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const entries = cachedParse(doc).entries
  for (const txn of entries) {
    const pos = txn.headerRange.from
    builder.add(
      pos,
      pos,
      Decoration.widget({
        widget: new TxnDescWidget(generateTxnDescription(txn), pickCategoryIcon(txn)),
        block: true,
        side: -1,
      }),
    )
  }
  return builder.finish()
}

export const txnDescriptions = [
  StateField.define<DecorationSet>({
    create: (state) => buildTxnDescs(state.doc),
    update(value, tr) {
      return tr.docChanged ? buildTxnDescs(tr.newDoc) : value
    },
    provide: (f) => EditorView.decorations.from(f),
  }),
  gutterWidgetClass.of((_view, widget) => {
    if (!(widget instanceof TxnDescWidget)) return null
    return descGutterMarker
  }),
]

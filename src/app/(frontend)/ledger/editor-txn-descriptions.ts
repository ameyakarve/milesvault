import { RangeSetBuilder, StateField, type Text } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from '@codemirror/view'
import { generateTxnDescription } from '@/lib/beancount/txn-description'
import { cachedParse } from './parse-cache'

class TxnDescWidget extends WidgetType {
  constructor(readonly text: string) {
    super()
  }
  toDOM(): HTMLElement {
    const div = document.createElement('div')
    div.className = 'cm-txn-desc'
    div.textContent = this.text
    return div
  }
  eq(other: WidgetType): boolean {
    return other instanceof TxnDescWidget && other.text === this.text
  }
}

function buildTxnDescs(doc: Text): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (const txn of cachedParse(doc).entries) {
    const pos = txn.headerRange.from
    builder.add(
      pos,
      pos,
      Decoration.widget({
        widget: new TxnDescWidget(generateTxnDescription(txn)),
        block: true,
        side: -1,
      }),
    )
  }
  return builder.finish()
}

export const txnDescriptions = StateField.define<DecorationSet>({
  create: (state) => buildTxnDescs(state.doc),
  update(value, tr) {
    return tr.docChanged ? buildTxnDescs(tr.newDoc) : value
  },
  provide: (f) => EditorView.decorations.from(f),
})

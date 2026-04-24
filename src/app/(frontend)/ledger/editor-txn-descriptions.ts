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

class TxnDescGutterMarker extends GutterMarker {
  constructor(readonly banded: boolean) {
    super()
    this.elementClass = banded ? 'cm-txn-desc-gutter cm-txn-band' : 'cm-txn-desc-gutter'
  }
  eq(other: GutterMarker): boolean {
    return other instanceof TxnDescGutterMarker && other.banded === this.banded
  }
}
const bandedDescMarker = new TxnDescGutterMarker(true)
const plainDescMarker = new TxnDescGutterMarker(false)

class TxnDescWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly banded: boolean,
  ) {
    super()
  }
  toDOM(): HTMLElement {
    const div = document.createElement('div')
    div.className = this.banded ? 'cm-txn-desc cm-txn-band' : 'cm-txn-desc'
    div.textContent = this.text
    return div
  }
  eq(other: WidgetType): boolean {
    return (
      other instanceof TxnDescWidget &&
      other.text === this.text &&
      other.banded === this.banded
    )
  }
}

function buildTxnDescs(doc: Text): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const entries = cachedParse(doc).entries
  for (let i = 0; i < entries.length; i++) {
    const txn = entries[i]
    const pos = txn.headerRange.from
    builder.add(
      pos,
      pos,
      Decoration.widget({
        widget: new TxnDescWidget(generateTxnDescription(txn), i % 2 === 0),
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
    return widget.banded ? bandedDescMarker : plainDescMarker
  }),
]

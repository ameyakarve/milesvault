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
import { openAiForRange } from './editor-ai-widget'

function dayLabelText(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  const mmm = d.toLocaleString('en', { month: 'short' }).toUpperCase()
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mmm} ${dd}`
}

class TxnDescGutterMarker extends GutterMarker {
  elementClass = 'cm-txn-desc-gutter'
}
const descGutterMarker = new TxnDescGutterMarker()

export class TxnDescWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly iconKey: string | null,
    readonly rangeFrom: number,
    readonly rangeTo: number,
    readonly dayLabel: string | null,
  ) {
    super()
  }
  toDOM(view: EditorView): HTMLElement {
    const div = document.createElement('div')
    div.className = 'cm-txn-desc'
    div.innerHTML = `<span class="cm-txn-desc-icon-slot">${renderIconSVG(this.iconKey)}</span><span class="cm-txn-desc-text">${escapeHtml(this.text)}</span><button type="button" class="cm-txn-desc-handle" aria-label="Edit with AI" title="Edit with AI (⌘I)">⋯</button>`
    const handle = div.querySelector<HTMLButtonElement>('.cm-txn-desc-handle')
    handle?.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      openAiForRange(view, this.rangeFrom, this.rangeTo)
    })
    return div
  }
  eq(other: WidgetType): boolean {
    return (
      other instanceof TxnDescWidget &&
      other.text === this.text &&
      other.iconKey === this.iconKey &&
      other.rangeFrom === this.rangeFrom &&
      other.rangeTo === this.rangeTo &&
      other.dayLabel === this.dayLabel
    )
  }
  ignoreEvent(): boolean {
    return false
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
  let prevDate: string | null = null
  for (const txn of entries) {
    const pos = txn.headerRange.from
    const dayLabel = txn.date === prevDate ? null : dayLabelText(txn.date)
    prevDate = txn.date
    builder.add(
      pos,
      pos,
      Decoration.widget({
        widget: new TxnDescWidget(
          generateTxnDescription(txn),
          pickCategoryIcon(txn),
          txn.range.from,
          txn.range.to,
          dayLabel,
        ),
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

import { RangeSetBuilder, StateField, type Text } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  GutterMarker,
  gutterWidgetClass,
  WidgetType,
} from '@codemirror/view'
import { cachedParse } from './parse-cache'

class DocHeaderGutterMarker extends GutterMarker {
  elementClass = 'cm-doc-header-gutter'
}
const headerGutterMarker = new DocHeaderGutterMarker()

class DocHeaderWidget extends WidgetType {
  constructor(readonly meta: string) {
    super()
  }
  toDOM(): HTMLElement {
    const div = document.createElement('div')
    div.className = 'cm-doc-header'
    const title = document.createElement('div')
    title.className = 'cm-doc-header-title'
    title.textContent = 'Ledger'
    const meta = document.createElement('div')
    meta.className = 'cm-doc-header-meta'
    meta.textContent = this.meta
    div.appendChild(title)
    div.appendChild(meta)
    return div
  }
  eq(other: WidgetType): boolean {
    return other instanceof DocHeaderWidget && other.meta === this.meta
  }
}

function metaFor(doc: Text): string {
  const entries = cachedParse(doc).entries
  if (entries.length === 0) return 'empty'
  const dates = entries.map((e) => e.date).sort()
  const first = dates[0]
  const last = dates[dates.length - 1]
  const count = `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`
  return first === last ? `${count} · ${first}` : `${count} · ${first} – ${last}`
}

function buildDocHeader(doc: Text): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  builder.add(
    0,
    0,
    Decoration.widget({
      widget: new DocHeaderWidget(metaFor(doc)),
      block: true,
      side: -3,
    }),
  )
  return builder.finish()
}

export const docHeader = [
  StateField.define<DecorationSet>({
    create: (state) => buildDocHeader(state.doc),
    update(value, tr) {
      return tr.docChanged ? buildDocHeader(tr.newDoc) : value
    },
    provide: (f) => EditorView.decorations.from(f),
  }),
  gutterWidgetClass.of((_view, widget) => {
    if (!(widget instanceof DocHeaderWidget)) return null
    return headerGutterMarker
  }),
]

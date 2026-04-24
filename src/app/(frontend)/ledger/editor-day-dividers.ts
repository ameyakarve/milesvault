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

class DayDividerGutterMarker extends GutterMarker {
  elementClass = 'cm-day-divider-gutter'
}
const dayGutterMarker = new DayDividerGutterMarker()

class DayDividerWidget extends WidgetType {
  constructor(readonly label: string) {
    super()
  }
  toDOM(): HTMLElement {
    const div = document.createElement('div')
    div.className = 'cm-day-divider'
    div.textContent = this.label
    return div
  }
  eq(other: WidgetType): boolean {
    return other instanceof DayDividerWidget && other.label === this.label
  }
}

function labelFor(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  const mmm = d.toLocaleString('en', { month: 'short' }).toUpperCase()
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mmm} ${dd}`
}

function buildDividers(doc: Text): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const entries = cachedParse(doc).entries
  let prevDate: string | null = null
  for (const txn of entries) {
    if (txn.date === prevDate) continue
    prevDate = txn.date
    const pos = txn.headerRange.from
    builder.add(
      pos,
      pos,
      Decoration.widget({
        widget: new DayDividerWidget(labelFor(txn.date)),
        block: true,
        side: -2,
      }),
    )
  }
  return builder.finish()
}

export const dayDividers = [
  StateField.define<DecorationSet>({
    create: (state) => buildDividers(state.doc),
    update(value, tr) {
      return tr.docChanged ? buildDividers(tr.newDoc) : value
    },
    provide: (f) => EditorView.decorations.from(f),
  }),
  gutterWidgetClass.of((_view, widget) => {
    if (!(widget instanceof DayDividerWidget)) return null
    return dayGutterMarker
  }),
]

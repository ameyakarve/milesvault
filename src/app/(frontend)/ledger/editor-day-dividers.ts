import { RangeSet, RangeSetBuilder, StateField, type Text } from '@codemirror/state'
import { GutterMarker, gutter } from '@codemirror/view'
import { cachedParse } from './parse-cache'

class DayLabelMarker extends GutterMarker {
  constructor(readonly label: string) {
    super()
  }
  toDOM(): Node {
    const span = document.createElement('span')
    span.className = 'cm-day-label'
    span.textContent = this.label
    return span
  }
  eq(other: GutterMarker): boolean {
    return other instanceof DayLabelMarker && other.label === this.label
  }
}

function labelFor(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  const mmm = d.toLocaleString('en', { month: 'short' }).toUpperCase()
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mmm} ${dd}`
}

function buildDayMarkers(doc: Text): RangeSet<GutterMarker> {
  const builder = new RangeSetBuilder<GutterMarker>()
  const entries = cachedParse(doc).entries
  let prevDate: string | null = null
  for (const txn of entries) {
    if (txn.date === prevDate) continue
    prevDate = txn.date
    const pos = txn.headerRange.from
    builder.add(pos, pos, new DayLabelMarker(labelFor(txn.date)))
  }
  return builder.finish()
}

const dayLabelField = StateField.define<RangeSet<GutterMarker>>({
  create: (state) => buildDayMarkers(state.doc),
  update(value, tr) {
    return tr.docChanged ? buildDayMarkers(tr.newDoc) : value
  },
})

const dayLabelGutter = gutter({
  class: 'cm-day-label-gutter',
  markers: (view) => view.state.field(dayLabelField),
  initialSpacer: () => new DayLabelMarker('APR 00'),
})

export const dayDividers = [dayLabelField, dayLabelGutter]

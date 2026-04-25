import { GutterMarker, gutter } from '@codemirror/view'
import { TxnDescWidget } from './editor-txn-descriptions'

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

const dayLabelGutter = gutter({
  class: 'cm-day-label-gutter',
  widgetMarker: (_view, widget) => {
    if (!(widget instanceof TxnDescWidget)) return null
    if (!widget.dayLabel) return null
    return new DayLabelMarker(widget.dayLabel)
  },
  initialSpacer: () => new DayLabelMarker('APR 00'),
})

export const dayDividers = [dayLabelGutter]

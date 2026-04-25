import { GutterMarker, gutter } from '@codemirror/view'
import { TxnDescWidget } from './editor-txn-descriptions'

class DayLabelMarker extends GutterMarker {
  readonly month: string
  readonly day: string
  constructor(readonly label: string) {
    super()
    const [month, day] = label.split(' ')
    this.month = month ?? label
    this.day = day ?? ''
  }
  toDOM(): Node {
    const root = document.createElement('div')
    root.className = 'cm-day-label'
    const monthEl = document.createElement('span')
    monthEl.className = 'cm-day-label__month'
    monthEl.textContent = this.month
    const dayEl = document.createElement('span')
    dayEl.className = 'cm-day-label__day'
    dayEl.textContent = this.day
    root.appendChild(monthEl)
    root.appendChild(dayEl)
    return root
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

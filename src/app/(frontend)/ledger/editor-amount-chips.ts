import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import { cursorTxnLines, unveilChipAt } from './editor-chip-state'

const AMOUNT_RE = /([+-]?(?:\d+\.?\d*|\.\d+))(?=\s+[A-Z])/g

const SCALES: ReadonlyArray<readonly [string, number]> = [
  ['B', 9],
  ['M', 6],
  ['K', 3],
]

export function compressAmount(raw: string): string | null {
  const sign = raw[0] === '-' || raw[0] === '+' ? raw[0] : ''
  const body = sign ? raw.slice(1) : raw
  const [intPart, fracPart = ''] = body.split('.')
  const cleanInt = intPart.replace(/^0+(?=\d)/, '') || '0'
  for (const [suffix, digits] of SCALES) {
    if (cleanInt.length <= digits) continue
    const head = cleanInt.slice(0, cleanInt.length - digits)
    const tail = (cleanInt.slice(cleanInt.length - digits) + fracPart).replace(/0+$/, '')
    const compressed = `${sign}${head}${tail ? `.${tail}` : ''}${suffix}`
    if (compressed.length <= raw.length) return compressed
  }
  return null
}

type Hit = {
  from: number
  to: number
  compressed: string
}

function findAmountHits(view: EditorView): Hit[] {
  const hits: Hit[] = []
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to)
    for (const m of text.matchAll(AMOUNT_RE)) {
      const raw = m[1]
      const idx = m.index ?? 0
      const compressed = compressAmount(raw)
      if (!compressed) continue
      hits.push({ from: from + idx, to: from + idx + raw.length, compressed })
    }
  }
  return hits
}

class AmountChipWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly width: number,
  ) {
    super()
  }
  toDOM(view: EditorView): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-amount-chip'
    span.style.width = `${this.width}ch`
    span.textContent = this.label
    span.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const pos = view.posAtDOM(span)
      unveilChipAt(view, pos)
    })
    return span
  }
  eq(other: WidgetType): boolean {
    return (
      other instanceof AmountChipWidget &&
      other.label === this.label &&
      other.width === this.width
    )
  }
  ignoreEvent(): boolean {
    return false
  }
}

function buildAmountDecorations(view: EditorView): DecorationSet {
  const active = cursorTxnLines(view.state)
  const doc = view.state.doc
  const hits = findAmountHits(view).sort((a, b) => a.from - b.from)
  const builder = new RangeSetBuilder<Decoration>()
  for (const h of hits) {
    const ln = doc.lineAt(h.from).number
    if (ln >= active.from && ln <= active.to) continue
    builder.add(
      h.from,
      h.to,
      Decoration.replace({
        widget: new AmountChipWidget(h.compressed, h.to - h.from),
      }),
    )
  }
  return builder.finish()
}

export const amountChips = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildAmountDecorations(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet) {
        this.decorations = buildAmountDecorations(u.view)
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

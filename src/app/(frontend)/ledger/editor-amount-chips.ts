import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import { cursorPos, unveilChipAt } from './editor-chip-state'

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
  primary: boolean
}

function findAmountHits(view: EditorView): Hit[] {
  const hits: Hit[] = []
  const doc = view.state.doc
  for (const { from, to } of view.visibleRanges) {
    let lineNum = doc.lineAt(from).number
    const endLineNum = doc.lineAt(to).number
    while (lineNum <= endLineNum) {
      const line = doc.line(lineNum)
      let seen = false
      for (const m of line.text.matchAll(AMOUNT_RE)) {
        const raw = m[1]
        const idx = m.index ?? 0
        const compressed = compressAmount(raw)
        if (compressed) {
          hits.push({
            from: line.from + idx,
            to: line.from + idx + raw.length,
            compressed,
            primary: !seen,
          })
        }
        seen = true
      }
      lineNum += 1
    }
  }
  return hits
}

class AmountChipWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly slotWidth: number | null,
  ) {
    super()
  }
  toDOM(view: EditorView): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-amount-chip'
    if (this.slotWidth !== null) {
      span.style.width = `${this.slotWidth}ch`
      span.style.textAlign = 'right'
    }
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
      other.slotWidth === this.slotWidth
    )
  }
  ignoreEvent(): boolean {
    return false
  }
}

function buildAmountDecorations(view: EditorView): DecorationSet {
  const cursor = cursorPos(view.state)
  const hits = findAmountHits(view).sort((a, b) => a.from - b.from)
  const builder = new RangeSetBuilder<Decoration>()
  for (const h of hits) {
    if (cursor >= h.from && cursor <= h.to) continue
    const slotWidth = h.primary ? h.to - h.from : null
    builder.add(
      h.from,
      h.to,
      Decoration.replace({
        widget: new AmountChipWidget(h.compressed, slotWidth),
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

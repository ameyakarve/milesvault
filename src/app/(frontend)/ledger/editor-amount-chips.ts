import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, type DecorationSet, type EditorView } from '@codemirror/view'
import { ChipWidget } from './chip-widget'
import { cursorPos } from './editor-chip-state'
import { cachedParse, isInVisibleRange, makeChipPlugin } from './parse-cache'

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
  raw: string
  compressed: string
  primary: boolean
}

function findAmountHits(view: EditorView): Hit[] {
  const hits: Hit[] = []
  const { amounts, postingAmountStarts } = cachedParse(view.state.doc)
  for (const amt of amounts) {
    if (!isInVisibleRange(view, amt.range.from)) continue
    const raw = amt.numberText
    if (!raw) continue
    const compressed = compressAmount(raw)
    if (!compressed) continue
    const from = amt.range.from
    hits.push({
      from,
      to: from + raw.length,
      raw,
      compressed,
      primary: postingAmountStarts.has(from),
    })
  }
  return hits
}

function buildAmountDecorations(view: EditorView): DecorationSet {
  const cursor = cursorPos(view.state)
  const hits = findAmountHits(view).sort((a, b) => a.from - b.from)
  const builder = new RangeSetBuilder<Decoration>()
  for (const h of hits) {
    if (cursor >= h.from && cursor <= h.to) continue
    const width = h.primary ? h.to - h.from : h.compressed.length
    builder.add(
      h.from,
      h.to,
      Decoration.replace({
        widget: new ChipWidget({
          variant: 'amount',
          label: h.compressed,
          tooltip: h.raw,
          width,
        }),
      }),
    )
  }
  return builder.finish()
}

export const amountChips = makeChipPlugin(buildAmountDecorations)

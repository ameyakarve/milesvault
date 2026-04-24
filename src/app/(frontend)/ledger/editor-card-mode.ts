import { RangeSet, RangeSetBuilder, StateField, type Text } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  GutterMarker,
  gutterLineClass,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import { cachedSplit, entryEndLineTrimmed } from './editor'
import { PAPER_BG, SLATE_200 } from './editor-theme'

const CARD = 'cm-card'
const CARD_FIRST = 'cm-card-first'
const CARD_LAST = 'cm-card-last'
const CARD_MID = 'cm-card-mid'
const CARD_ACTIVE = 'cm-card-active'

const cardActive = Decoration.line({ attributes: { class: CARD_ACTIVE } })

const cardFirst = Decoration.line({ attributes: { class: `${CARD} ${CARD_FIRST}` } })
const cardLast = Decoration.line({ attributes: { class: `${CARD} ${CARD_LAST}` } })
const cardMid = Decoration.line({ attributes: { class: `${CARD} ${CARD_MID}` } })
const cardSolo = Decoration.line({
  attributes: { class: `${CARD} ${CARD_FIRST} ${CARD_LAST}` },
})

class CardGutterMarker extends GutterMarker {
  declare elementClass: string
  constructor(cls: string) {
    super()
    this.elementClass = cls
  }
}
const gutterFirst = new CardGutterMarker(`${CARD} ${CARD_FIRST}`)
const gutterLast = new CardGutterMarker(`${CARD} ${CARD_LAST}`)
const gutterMid = new CardGutterMarker(`${CARD} ${CARD_MID}`)
const gutterSolo = new CardGutterMarker(`${CARD} ${CARD_FIRST} ${CARD_LAST}`)

type CardSets = {
  lines: DecorationSet
  gutter: RangeSet<GutterMarker>
}

function buildCardSets(doc: Text): CardSets {
  const lineBuilder = new RangeSetBuilder<Decoration>()
  const gutterBuilder = new RangeSetBuilder<GutterMarker>()
  for (const e of cachedSplit(doc)) {
    const start = e.startLine
    const end = entryEndLineTrimmed(doc, e)
    if (start === end) {
      const line = doc.line(start + 1)
      lineBuilder.add(line.from, line.from, cardSolo)
      gutterBuilder.add(line.from, line.from, gutterSolo)
      continue
    }
    for (let ln = start; ln <= end; ln++) {
      const line = doc.line(ln + 1)
      const deco = ln === start ? cardFirst : ln === end ? cardLast : cardMid
      const gmark = ln === start ? gutterFirst : ln === end ? gutterLast : gutterMid
      lineBuilder.add(line.from, line.from, deco)
      gutterBuilder.add(line.from, line.from, gmark)
    }
  }
  return { lines: lineBuilder.finish(), gutter: gutterBuilder.finish() }
}

function buildActiveCard(view: EditorView): DecorationSet {
  const doc = view.state.doc
  const cursor = view.state.selection.main.head
  const cursorLine = doc.lineAt(cursor).number - 1
  const builder = new RangeSetBuilder<Decoration>()
  for (const e of cachedSplit(doc)) {
    const start = e.startLine
    const end = entryEndLineTrimmed(doc, e)
    if (cursorLine < start || cursorLine > end) continue
    for (let ln = start; ln <= end; ln++) {
      const line = doc.line(ln + 1)
      builder.add(line.from, line.from, cardActive)
    }
    break
  }
  return builder.finish()
}

const activeCardPlugin = ViewPlugin.define(
  (view) => ({
    decorations: buildActiveCard(view),
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildActiveCard(update.view)
      }
    },
  }),
  { decorations: (v) => v.decorations },
)

const cardModeField = StateField.define<CardSets>({
  create: (state) => buildCardSets(state.doc),
  update(value, tr) {
    return tr.docChanged ? buildCardSets(tr.newDoc) : value
  },
  provide: (f) => [
    EditorView.decorations.from(f, (v) => v.lines),
    gutterLineClass.from(f, (v) => v.gutter),
  ],
})

const CARD_BG = '#FFFFFF'
const ACTIVE_BG = 'rgba(8, 145, 178, 0.04)'
const ACTIVE_BORDER = '1px solid rgba(8, 145, 178, 0.35)'
const BORDER = `1px solid ${SLATE_200}`
const DROP_SHADOW = '0 1px 2px rgba(15, 23, 42, 0.04)'
const RADIUS = '6px'
const PAD_X = '20px'
const GAP = '8px'

const cardModeTheme = EditorView.theme(
  {
    '&': { backgroundColor: `${PAPER_BG} !important` },
    '.cm-scroller': { backgroundColor: `${PAPER_BG} !important` },
    '.cm-content': { padding: '6px 18px 28px' },
    '.cm-gutters': { backgroundColor: `${PAPER_BG} !important`, border: 'none' },
    '.cm-gutterElement': { borderBottom: 'none !important' },
    '.cm-line': { borderBottom: 'none !important' },
    '.cm-txn-band': { backgroundColor: 'transparent !important' },
    [`.cm-line.${CARD}`]: {
      padding: `0 ${PAD_X}`,
      backgroundColor: `${CARD_BG} !important`,
      borderLeft: BORDER,
      borderRight: BORDER,
    },
    [`.cm-line.${CARD_LAST}`]: {
      borderBottom: BORDER,
      borderBottomLeftRadius: RADIUS,
      borderBottomRightRadius: RADIUS,
      boxShadow: DROP_SHADOW,
      marginBottom: GAP,
    },
    '.cm-txn-desc': {
      borderTop: BORDER,
      borderLeft: BORDER,
      borderRight: BORDER,
      borderTopLeftRadius: RADIUS,
      borderTopRightRadius: RADIUS,
    },
    '.cm-txn-desc-gutter': {
      borderTopLeftRadius: RADIUS,
      borderBottom: 'none !important',
    },
    [`.cm-line.${CARD}.${CARD_ACTIVE}`]: {
      backgroundColor: `${ACTIVE_BG} !important`,
      borderLeft: ACTIVE_BORDER,
      borderRight: ACTIVE_BORDER,
    },
    [`.cm-line.${CARD_FIRST}.${CARD_ACTIVE}`]: {
      borderTop: ACTIVE_BORDER,
    },
    [`.cm-line.${CARD_LAST}.${CARD_ACTIVE}`]: {
      borderBottom: ACTIVE_BORDER,
    },
  },
  { dark: false },
)

export const cardMode = [cardModeField, activeCardPlugin, cardModeTheme]

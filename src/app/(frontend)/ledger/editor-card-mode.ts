import { RangeSet, RangeSetBuilder, StateField, type Text } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  GutterMarker,
  gutterLineClass,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import { cachedSplit, entryEndLineTrimmed } from './editor'
import { NAVY_700, PAPER_BG, SLATE_200, SLATE_700, TEAL_PRIMARY } from './editor-theme'

const CARD = 'cm-card'
const CARD_FIRST = 'cm-card-first'
const CARD_LAST = 'cm-card-last'
const CARD_MID = 'cm-card-mid'
const CARD_ACTIVE = 'cm-card-active'
const CARD_TAIL = 'cm-card-tail'

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

class CardTailWidget extends WidgetType {
  eq() {
    return true
  }
  toDOM() {
    const div = document.createElement('div')
    div.className = CARD_TAIL
    div.setAttribute('aria-hidden', 'true')
    return div
  }
  ignoreEvent() {
    return true
  }
  get estimatedHeight() {
    return 13
  }
}
const cardTailDeco = Decoration.widget({
  widget: new CardTailWidget(),
  block: true,
  side: 1,
})

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
    } else {
      for (let ln = start; ln <= end; ln++) {
        const line = doc.line(ln + 1)
        const deco = ln === start ? cardFirst : ln === end ? cardLast : cardMid
        const gmark = ln === start ? gutterFirst : ln === end ? gutterLast : gutterMid
        lineBuilder.add(line.from, line.from, deco)
        gutterBuilder.add(line.from, line.from, gmark)
      }
    }
    const lastLine = doc.line(end + 1)
    lineBuilder.add(lastLine.to, lastLine.to, cardTailDeco)
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
const ACTIVE_BG = '#F0FDFA'
const ACTIVE_DESC_BG = '#F4FBFB'
const ACTIVE_EDGE = '#14B8A6'
const ACTIVE_RAIL_BG = `linear-gradient(to right, ${ACTIVE_BG} 16px, ${TEAL_PRIMARY} 16px, ${TEAL_PRIMARY} 18px, ${ACTIVE_BG} 18px)`
const ACTIVE_BORDER = `1px solid ${ACTIVE_EDGE}`
const ACTIVE_SHADOW =
  '0 0 0 1px rgba(20, 184, 166, 0.20), 0 8px 28px rgba(15, 23, 42, 0.08), 0 16px 40px rgba(15, 23, 42, 0.06), 0 4px 12px rgba(15, 23, 42, 0.05)'
const BORDER = `1px solid ${SLATE_200}`
const INNER_RAIL = `inset 2px 0 0 0 ${SLATE_200}`
const DROP_SHADOW = '0 1px 2px rgba(15, 23, 42, 0.04)'
const RADIUS = '6px'
const PAD_X = '24px'

const cardModeTheme = EditorView.theme(
  {
    '&': { backgroundColor: `${PAPER_BG} !important` },
    '.cm-scroller': { backgroundColor: `${PAPER_BG} !important` },
    '.cm-content': { padding: '11px 0 28px 2px !important' },
    '.cm-gutters': { backgroundColor: `${PAPER_BG} !important`, border: 'none !important' },
    '.cm-gutter-lint, .cm-changeGutter': { display: 'none !important' },
    '.cm-day-label-gutter .cm-gutterElement': { padding: '0 0 0 0 !important' },
    '.cm-gutterElement': { borderBottom: 'none !important' },
    '.cm-line:not(.cm-card)': { borderBottom: 'none !important' },
    '.cm-line:not(.cm-card):not(.cm-line-comment)': {
      lineHeight: '0.9 !important',
      padding: '0 !important',
      fontSize: '10px',
    },
    '.cm-txn-band': { backgroundColor: 'transparent !important' },
    [`.cm-line.${CARD}`]: {
      padding: `4px ${PAD_X}`,
      backgroundColor: `${CARD_BG} !important`,
      borderLeft: BORDER,
      borderRight: BORDER,
    },
    [`.cm-line.${CARD_FIRST}`]: {
      paddingTop: '12px',
      paddingBottom: '4px',
    },
    [`.cm-line.${CARD_MID}, .cm-line.${CARD_LAST}`]: {
      paddingTop: '3px',
      paddingBottom: '3px',
      boxShadow: INNER_RAIL,
    },
    [`.${CARD_TAIL}`]: {
      height: '13px',
      borderLeft: BORDER,
      borderRight: BORDER,
      borderBottom: BORDER,
      borderBottomLeftRadius: RADIUS,
      borderBottomRightRadius: RADIUS,
      backgroundColor: CARD_BG,
      boxShadow: DROP_SHADOW,
    },
    [`.cm-line.${CARD_ACTIVE} + .${CARD_TAIL}`]: {
      backgroundColor: ACTIVE_BG,
      borderLeft: ACTIVE_BORDER,
      borderRight: ACTIVE_BORDER,
      borderBottom: ACTIVE_BORDER,
      boxShadow: ACTIVE_SHADOW,
    },
    '.cm-txn-desc': {
      borderTop: BORDER,
      borderLeft: BORDER,
      borderRight: BORDER,
      borderTopLeftRadius: RADIUS,
      borderTopRightRadius: RADIUS,
    },
    '.cm-txn-desc-gutter': {
      borderBottom: 'none !important',
    },
    [`.cm-line.${CARD}.${CARD_ACTIVE}`]: {
      background: `${ACTIVE_RAIL_BG} !important`,
      borderLeft: ACTIVE_BORDER,
      borderRight: ACTIVE_BORDER,
      color: `${SLATE_700} !important`,
    },
    [`.cm-line.${CARD}.${CARD_ACTIVE} *`]: {
      color: `${SLATE_700} !important`,
    },
    [`.cm-txn-desc:has(+ .cm-line.${CARD_ACTIVE})`]: {
      backgroundColor: `${ACTIVE_DESC_BG} !important`,
      backgroundImage: 'none !important',
      borderTop: `${ACTIVE_BORDER} !important`,
      borderLeft: `${ACTIVE_BORDER} !important`,
      borderRight: `${ACTIVE_BORDER} !important`,
      borderBottom: `1px solid ${SLATE_200} !important`,
      color: `${NAVY_700} !important`,
      fontWeight: '600',
    },
    [`.cm-line.${CARD_FIRST}.${CARD_ACTIVE}`]: {
      background: `${ACTIVE_BG} !important`,
    },
    [`.cm-line.${CARD_MID}.${CARD_ACTIVE}, .cm-line.${CARD_LAST}.${CARD_ACTIVE}`]: {
      boxShadow: 'none',
    },
  },
  { dark: false },
)

export const cardMode = [cardModeField, activeCardPlugin, cardModeTheme]

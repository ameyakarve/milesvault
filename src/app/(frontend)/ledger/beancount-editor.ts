import {
  HighlightStyle,
  LanguageSupport,
  LRLanguage,
  syntaxHighlighting,
} from '@codemirror/language'
import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { parser } from 'lezer-beancount'

const beancountLanguage = LRLanguage.define({
  name: 'beancount',
  parser,
  languageData: {
    commentTokens: { line: ';' },
  },
})

const INK = '#09090B'
const STRING = '#18181B'
const ACCOUNT = '#475569'
const CURRENCY = '#71717A'
const DATE = '#0F766E'
const TAG = '#B45309'
const LINK = '#4338CA'
const NUMBER = '#075985'
const MUTED = '#A1A1AA'
const FAINT = '#D4D4D8'

const highlight = HighlightStyle.define([
  { tag: t.lineComment, color: MUTED, fontStyle: 'italic' },
  { tag: t.string, color: STRING },
  { tag: t.number, color: NUMBER, fontWeight: '600' },
  { tag: t.literal, color: DATE },
  { tag: t.bool, color: INK },
  { tag: t.variableName, color: ACCOUNT },
  { tag: t.unit, color: CURRENCY },
  { tag: t.modifier, color: INK, fontWeight: '600' },
  { tag: t.keyword, color: INK, fontWeight: '600' },
  { tag: t.tagName, color: TAG },
  { tag: t.link, color: LINK },
  { tag: t.propertyName, color: CURRENCY, fontStyle: 'italic' },
  { tag: [t.operator, t.arithmeticOperator], color: MUTED },
  { tag: [t.brace, t.paren, t.separator, t.punctuation], color: FAINT },
  { tag: t.heading, color: INK, fontWeight: '600' },
])

const beancountSupport = new LanguageSupport(beancountLanguage, [syntaxHighlighting(highlight)])

const blockDivider = Decoration.line({ attributes: { class: 'cm-txn-divider' } })

function buildBlockDividers(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc
  let sawFirstBlock = false
  let prevBlank = true
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    const isBlank = line.text.trim() === ''
    if (!isBlank && prevBlank) {
      if (sawFirstBlock) builder.add(line.from, line.from, blockDivider)
      sawFirstBlock = true
    }
    prevBlank = isBlank
  }
  return builder.finish()
}

const txnDividers = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildBlockDividers(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged) this.decorations = buildBlockDividers(u.view)
    }
  },
  { decorations: (v) => v.decorations },
)

const theme = EditorView.theme(
  {
    '&': {
      height: '100%',
      fontSize: '12px',
      backgroundColor: '#ffffff',
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      lineHeight: '1.5',
      fontVariantNumeric: 'tabular-nums',
    },
    '.cm-content': {
      padding: '16px 0',
      caretColor: INK,
      color: INK,
    },
    '.cm-line': { padding: '0 12px' },
    '.cm-txn-divider': { borderTop: '1px solid #E4E4E7' },
    '.cm-gutters': {
      backgroundColor: '#FAFAF9',
      color: MUTED,
      border: 'none',
      borderRight: '1px solid #F4F4F5',
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: '11px',
    },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 16px' },
    '.cm-activeLine': { backgroundColor: 'transparent' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: INK },
    '.cm-selectionBackground, .cm-content ::selection, ::selection': {
      backgroundColor: '#E4E4E7 !important',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: INK, borderLeftWidth: '1px' },
  },
  { dark: false },
)

export const beancountExtensions = [beancountSupport, txnDividers, theme]

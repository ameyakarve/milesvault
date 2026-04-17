import { indentLess, indentMore } from '@codemirror/commands'
import {
  HighlightStyle,
  LanguageSupport,
  LRLanguage,
  indentService,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language'
import { type Diagnostic, linter, lintGutter } from '@codemirror/lint'
import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  keymap,
} from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { parser } from 'lezer-beancount'
import { isUnparseableLine, splitEntries, validateTxn } from '@/lib/beancount/extract'

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

const INDENT = '  '

const beancountIndentService = indentService.of((ctx, pos) => {
  const line = ctx.state.doc.lineAt(pos)
  for (let n = line.number - 1; n >= 1; n--) {
    const prev = ctx.state.doc.line(n).text
    if (prev.trim() === '') return 0
    const lead = prev.match(/^[ \t]*/)
    const leadLen = lead ? lead[0].length : 0
    if (leadLen > 0) return leadLen
    if (/^\d{4}-\d{2}-\d{2}/.test(prev)) return INDENT.length
    return 0
  }
  return 0
})

const beancountTabKeymap = keymap.of([
  {
    key: 'Tab',
    run: (view) => {
      const { state } = view
      const multiLine = state.selection.ranges.some(
        (r) => state.doc.lineAt(r.from).number !== state.doc.lineAt(r.to).number,
      )
      if (multiLine) return indentMore(view)
      view.dispatch(state.replaceSelection(INDENT))
      return true
    },
    shift: indentLess,
  },
])

const entryDivider = Decoration.line({ attributes: { class: 'cm-txn-divider' } })
const unparseableLine = Decoration.line({ attributes: { class: 'cm-txn-unparseable' } })

function buildEntryDividers(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc
  const entries = splitEntries(doc.toString())
  for (let i = 1; i < entries.length; i++) {
    const line = doc.line(entries[i].startLine + 1)
    builder.add(line.from, line.from, entryDivider)
  }
  return builder.finish()
}

const beancountLinter = linter(
  (view) => {
    const diagnostics: Diagnostic[] = []
    const doc = view.state.doc
    for (const entry of splitEntries(doc.toString())) {
      const r = validateTxn(entry.text)
      if (r.ok === true) continue
      for (const d of r.diagnostics) {
        if (d.kind !== 'rule-violation') continue
        const lineNum = Math.min(entry.startLine + d.lineOffset, entry.endLine) + 1
        const line = doc.line(lineNum)
        diagnostics.push({
          from: line.from,
          to: line.to,
          severity: 'error',
          message: d.message,
        })
      }
    }
    return diagnostics
  },
  { delay: 400 },
)

function buildUnparseableLines(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    if (isUnparseableLine(line.text)) {
      builder.add(line.from, line.from, unparseableLine)
    }
  }
  return builder.finish()
}

const txnDividers = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildEntryDividers(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged) this.decorations = buildEntryDividers(u.view)
    }
  },
  { decorations: (v) => v.decorations },
)

const unparseableLines = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildUnparseableLines(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged) this.decorations = buildUnparseableLines(u.view)
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
    '.cm-txn-unparseable': { color: MUTED, fontStyle: 'italic' },
    '.cm-lintRange-error': {
      backgroundImage: 'none',
      textDecoration: 'underline wavy #b91c1c',
      textDecorationSkipInk: 'none',
    },
    '.cm-gutter-lint': {
      width: '12px',
      backgroundColor: '#FAFAF9',
      borderRight: '1px solid #F4F4F5',
    },
    '.cm-gutter-lint .cm-lint-marker-error': {
      content: "''",
      display: 'block',
      width: '5px',
      height: '5px',
      margin: '6px auto 0',
      borderRadius: '50%',
      backgroundColor: '#b91c1c',
    },
    '.cm-gutter-lint .cm-lint-marker-error svg': { display: 'none' },
    '.cm-tooltip.cm-tooltip-lint': {
      backgroundColor: '#ffffff',
      border: '1px solid #E4E4E7',
      borderRadius: '4px',
      boxShadow: '0 2px 8px rgba(9,9,11,0.06)',
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: '11px',
      color: INK,
      padding: '6px 8px',
    },
    '.cm-tooltip.cm-tooltip-lint .cm-diagnostic': { padding: '2px 0' },
    '.cm-tooltip.cm-tooltip-lint .cm-diagnostic-error': {
      borderLeft: '2px solid #b91c1c',
      paddingLeft: '6px',
    },
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

export const beancountExtensions = [
  beancountSupport,
  indentUnit.of(INDENT),
  beancountIndentService,
  beancountTabKeymap,
  txnDividers,
  unparseableLines,
  beancountLinter,
  lintGutter(),
  theme,
]

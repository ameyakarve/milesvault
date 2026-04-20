import { indentLess, indentMore } from '@codemirror/commands'
import {
  HighlightStyle,
  LanguageSupport,
  LRLanguage,
  indentService,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language'
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
import { splitEntries } from '@/lib/beancount/extract'

const beancountLanguage = LRLanguage.define({
  name: 'beancount',
  parser,
  languageData: { commentTokens: { line: ';' } },
})

// Scandi palette tokens (mirrors tailwind.config.ts)
const NAVY_600 = '#1E293B'
const NAVY_700 = '#0F172A'
const SLATE_400 = '#94A3B8'
const SLATE_500 = '#64748B'
const SLATE_600 = '#475569'
const SLATE_200 = '#E2E8F0'
const SLATE_100 = '#F1F5F9'
const SLATE_50 = '#F8FAFC'
const SKY_600 = '#0284C7'
const SKY_700 = '#0369A1'
const AMBER_700 = '#B45309'

const highlight = HighlightStyle.define([
  { tag: t.lineComment, color: SLATE_400, fontStyle: 'italic' },
  { tag: t.string, color: NAVY_700 },
  { tag: t.number, color: NAVY_700, fontWeight: '600' },
  { tag: t.literal, color: SKY_700 },
  { tag: t.bool, color: NAVY_600 },
  { tag: t.variableName, color: SLATE_600 },
  { tag: t.unit, color: SLATE_500 },
  { tag: t.modifier, color: NAVY_600, fontWeight: '600' },
  { tag: t.keyword, color: NAVY_600, fontWeight: '600' },
  { tag: t.tagName, color: AMBER_700 },
  { tag: t.link, color: SKY_600 },
  { tag: t.propertyName, color: SLATE_500, fontStyle: 'italic' },
  { tag: [t.operator, t.arithmeticOperator], color: SLATE_400 },
  { tag: [t.brace, t.paren, t.separator, t.punctuation], color: SLATE_200 },
  { tag: t.heading, color: NAVY_600, fontWeight: '600' },
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

const theme = EditorView.theme(
  {
    '&': {
      height: '100%',
      fontSize: '11px',
      backgroundColor: '#ffffff',
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      lineHeight: '1.6',
      fontVariantNumeric: 'tabular-nums',
    },
    '.cm-content': {
      padding: '12px 0',
      caretColor: NAVY_600,
      color: NAVY_600,
    },
    '.cm-line': { padding: '0 12px' },
    '.cm-txn-divider': { borderTop: `1px solid ${SLATE_100}` },
    '.cm-gutters': {
      backgroundColor: '#ffffff',
      color: SLATE_400,
      border: 'none',
      borderRight: `1px solid ${SLATE_100}`,
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: '10px',
    },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 16px' },
    '.cm-activeLine': { backgroundColor: 'transparent' },
    '.cm-activeLineGutter': { backgroundColor: SLATE_50, color: NAVY_600 },
    '.cm-selectionBackground, .cm-content ::selection, ::selection': {
      backgroundColor: `${SLATE_200} !important`,
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: NAVY_600, borderLeftWidth: '1px' },
  },
  { dark: false },
)

export const scandiBeancountExtensions = [
  beancountSupport,
  indentUnit.of(INDENT),
  beancountIndentService,
  beancountTabKeymap,
  txnDividers,
  theme,
]

export function composeBuffer(rawTexts: string[]): string {
  return rawTexts.map((r) => r.trim()).join('\n\n') + '\n'
}

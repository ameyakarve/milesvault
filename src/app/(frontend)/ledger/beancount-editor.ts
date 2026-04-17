import {
  HighlightStyle,
  LanguageSupport,
  LRLanguage,
  syntaxHighlighting,
} from '@codemirror/language'
import { type Diagnostic, linter, lintGutter } from '@codemirror/lint'
import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { parser } from 'lezer-beancount'
import { validateTxn } from '@/lib/beancount/extract'

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

type Block = { fromLine: number; toLine: number; text: string }

function collectBlocks(doc: EditorView['state']['doc']): Block[] {
  const blocks: Block[] = []
  let startLine = 0
  let bodyLines: string[] = []
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    const isBlank = line.text.trim() === ''
    if (isBlank) {
      if (startLine > 0) {
        blocks.push({ fromLine: startLine, toLine: i - 1, text: bodyLines.join('\n') })
        startLine = 0
        bodyLines = []
      }
    } else {
      if (startLine === 0) startLine = i
      bodyLines.push(line.text)
    }
  }
  if (startLine > 0) {
    blocks.push({ fromLine: startLine, toLine: doc.lines, text: bodyLines.join('\n') })
  }
  return blocks
}

function diagnosticAnchor(doc: EditorView['state']['doc'], block: Block): number {
  for (let i = block.fromLine; i <= block.toLine; i++) {
    const line = doc.line(i)
    if (!line.text.trimStart().startsWith(';')) return i
  }
  return block.fromLine
}

const beancountLinter = linter(
  (view) => {
    const diagnostics: Diagnostic[] = []
    const doc = view.state.doc
    for (const block of collectBlocks(doc)) {
      const r = validateTxn(block.text)
      if (r.ok) continue
      const anchor = doc.line(diagnosticAnchor(doc, block))
      for (const msg of r.errors) {
        diagnostics.push({
          from: anchor.from,
          to: anchor.to,
          severity: 'error',
          message: msg,
        })
      }
    }
    return diagnostics
  },
  { delay: 400 },
)

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
  txnDividers,
  beancountLinter,
  lintGutter(),
  theme,
]

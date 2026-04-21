import { HighlightStyle } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

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

export const scandiHighlight = HighlightStyle.define([
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

export const scandiEditorTheme = EditorView.theme(
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
    '.cm-txn-created': {
      backgroundColor: 'rgba(236, 253, 245, 0.85)',
      boxShadow: 'inset 2px 0 0 #059669',
    },
    '.cm-txn-updated': {
      backgroundColor: 'rgba(240, 249, 255, 0.85)',
      boxShadow: 'inset 2px 0 0 #0284C7',
    },
    '.cm-word-added': {
      backgroundColor: 'rgba(125, 211, 252, 0.75)',
      color: NAVY_700,
      padding: '0 2px',
      borderRadius: '2px',
    },
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

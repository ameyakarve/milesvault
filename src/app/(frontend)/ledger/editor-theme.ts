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
  { tag: t.literal, color: SKY_700, fontWeight: '700' },
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
      fontSize: '13px',
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
    '.cm-line, .cm-deletedChunk': { padding: '0 12px' },
    '.cm-txn-band': { backgroundColor: SLATE_50 },
    '.cm-account-glyph': {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: '3px',
      height: '16px',
      verticalAlign: '-3px',
      color: SKY_700,
    },
    '.cm-account-glyph-chip': {
      fontWeight: '600',
    },
    '.cm-amount-chip': {
      display: 'inline-block',
      textAlign: 'right',
      whiteSpace: 'pre',
      color: NAVY_700,
      fontWeight: '600',
      fontVariantNumeric: 'tabular-nums',
    },
    '.cm-account-glyph-tip': {
      padding: '4px 8px',
      fontSize: '11px',
      fontWeight: '500',
      color: NAVY_600,
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    },
    '.cm-tooltip.cm-tooltip-hover': {
      backgroundColor: '#ffffff',
      border: `1px solid ${SLATE_200}`,
      borderRadius: '4px',
      boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)',
    },
    '.cm-gutters': {
      backgroundColor: '#ffffff',
      color: SLATE_400,
      border: 'none',
      borderRight: `1px solid ${SLATE_100}`,
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: '11px',
    },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 4px 0 8px' },
    '.cm-activeLine:not(.cm-changedLine):not(.cm-deletedLine)': {
      backgroundColor: 'transparent',
    },
    '.cm-activeLineGutter': { backgroundColor: SLATE_50, color: NAVY_600 },
    '.cm-selectionBackground, .cm-content ::selection, ::selection': {
      backgroundColor: `${SLATE_200} !important`,
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: NAVY_600, borderLeftWidth: '1px' },
    '&.cm-merge-b .cm-changedLine, .cm-inlineChangedLine': {
      backgroundColor: 'rgba(2, 132, 199, 0.10)',
    },
    '&.cm-merge-a .cm-changedLine, .cm-deletedChunk': {
      backgroundColor: 'rgba(180, 83, 9, 0.10)',
    },
    '&.cm-merge-b .cm-changedText, .cm-inlineChangedText': {
      background: 'rgba(2, 132, 199, 0.22)',
    },
    '.cm-changeGutter': { width: '10px' },
    '.cm-changedLineGutter, .cm-deletedLineGutter': {
      fontWeight: '600',
      textAlign: 'center',
    },
    '&.cm-merge-b .cm-changedLineGutter': {
      color: SKY_700,
      backgroundColor: 'rgba(2, 132, 199, 0.10)',
      '&::before': { content: '"+"' },
    },
    '& .cm-deletedLineGutter': {
      color: AMBER_700,
      backgroundColor: 'rgba(180, 83, 9, 0.10)',
      '&::before': { content: '"-"' },
    },
  },
  { dark: false },
)

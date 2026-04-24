import { HighlightStyle } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

const NAVY_600 = '#1E293B'
export const NAVY_700 = '#0F172A'
export const SLATE_400 = '#94A3B8'
export const SLATE_500 = '#64748B'
export const SLATE_600 = '#475569'
export const SLATE_200 = '#E2E8F0'
const SLATE_100 = '#F1F5F9'
export const SLATE_50 = '#F8FAFC'
const SKY_700 = '#0369A1'
const AMBER_700 = '#B45309'
export const TEAL_PRIMARY = '#0891B2'
const VIOLET_700 = '#6D28D9'
const MOCHA_700 = '#6F4518'
export const ROSE_700 = '#BE123C'

export const PAPER_BG = '#F4F6F8'

export const SANS_STACK =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"

const TOKEN_STYLE = {
  date: { color: NAVY_700, fontWeight: '600' },
  number: { color: NAVY_700, fontWeight: '600' },
  string: { color: NAVY_700 },
  account: { color: SLATE_600 },
  flag: { color: AMBER_700, fontWeight: '600' },
} as const

export const scandiHighlight = HighlightStyle.define([
  { tag: t.lineComment, color: SLATE_400 },
  { tag: t.string, ...TOKEN_STYLE.string },
  { tag: t.number, ...TOKEN_STYLE.number },
  { tag: t.literal, ...TOKEN_STYLE.date },
  { tag: t.bool, color: NAVY_600 },
  { tag: t.variableName, ...TOKEN_STYLE.account },
  { tag: t.unit, color: SLATE_500 },
  { tag: t.modifier, color: NAVY_600, fontWeight: '600' },
  { tag: t.keyword, color: NAVY_600, fontWeight: '600' },
  { tag: t.tagName, color: VIOLET_700, fontWeight: '500' },
  { tag: t.link, color: TEAL_PRIMARY, fontWeight: '500' },
  { tag: t.propertyName, color: SLATE_500 },
  { tag: [t.operator, t.arithmeticOperator], color: SLATE_400 },
  { tag: [t.brace, t.paren, t.separator, t.punctuation], color: SLATE_200 },
  { tag: t.heading, color: NAVY_600, fontWeight: '600' },
])

export const scandiEditorTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      fontSize: '12.5px',
      backgroundColor: PAPER_BG,
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      lineHeight: '1.5',
      fontVariantNumeric: 'tabular-nums',
      backgroundColor: PAPER_BG,
    },
    '.cm-content': {
      padding: '12px 0',
      caretColor: NAVY_600,
      color: NAVY_600,
      backgroundColor: 'transparent',
    },
    '.cm-line, .cm-deletedChunk': {
      padding: '0 12px',
      borderBottom: `1px solid ${SLATE_200}`,
    },
    '.cm-chip__dots, .cm-highlightSpace': {
      backgroundImage: `radial-gradient(circle, ${SLATE_400} 1px, transparent 1.25px)`,
      backgroundSize: '1ch 100%',
      backgroundRepeat: 'repeat-x',
      backgroundPosition: '0 55%',
    },
    '.cm-highlightSpace:before': {
      content: '""',
    },
    '.cm-txn-band': { backgroundColor: SLATE_50 },
    '.cm-txn-desc-gutter': {
      backgroundColor: SLATE_50,
      borderBottom: `1px solid ${SLATE_100}`,
    },
    '.cm-txn-desc': {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      height: '24px',
      padding: '0 12px',
      backgroundColor: SLATE_50,
      color: SLATE_500,
      fontSize: '11px',
      fontFamily: SANS_STACK,
      letterSpacing: '0.01em',
      lineHeight: '24px',
      borderBottom: `1px solid ${SLATE_100}`,
    },
    '.cm-txn-desc-icon-slot': {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '11px',
      height: '11px',
      flexShrink: 0,
      color: SLATE_400,
    },
    '.cm-txn-desc-icon': {
      width: '11px',
      height: '11px',
      display: 'block',
    },
    '.cm-txn-desc-text': { flex: 1, minWidth: 0 },
    '.cm-txn-desc-handle': {
      flexShrink: 0,
      width: '20px',
      height: '20px',
      padding: '0',
      margin: '0',
      border: 'none',
      background: 'transparent',
      color: SLATE_400,
      fontSize: '14px',
      lineHeight: '1',
      cursor: 'pointer',
      borderRadius: '4px',
      opacity: '0',
      transition: 'opacity 120ms ease, background-color 120ms ease, color 120ms ease',
    },
    '.cm-txn-desc:hover .cm-txn-desc-handle': { opacity: '1' },
    '.cm-txn-desc-handle:hover': {
      backgroundColor: SLATE_200,
      color: SLATE_600,
    },
    '.cm-day-divider': {
      padding: '16px 12px 6px',
      color: SLATE_500,
      fontFamily: SANS_STACK,
      fontSize: '10px',
      fontWeight: '600',
      letterSpacing: '0.12em',
      backgroundColor: PAPER_BG,
    },
    '.cm-day-divider-gutter': { backgroundColor: PAPER_BG },
    '.cm-line.cm-line-comment': {
      backgroundColor: `${SLATE_50} !important`,
      boxShadow: `inset 2px 0 0 0 ${SLATE_200}`,
      color: SLATE_500,
    },
    '.cm-chip': {
      display: 'inline-block',
      verticalAlign: 'baseline',
      whiteSpace: 'pre',
    },
    '.cm-chip__icon': {
      display: 'inline-block',
      width: '3ch',
    },
    '.cm-chip__icon svg': {
      display: 'inline-block',
      width: '3ch',
      height: '1em',
      verticalAlign: '-0.15em',
    },
    '.cm-chip--account': TOKEN_STYLE.account,
    '.cm-chip--date': TOKEN_STYLE.date,
    '.cm-chip--payee': { ...TOKEN_STYLE.string, color: ROSE_700 },
    '.cm-chip--narration': { ...TOKEN_STYLE.string, color: SLATE_500 },
    '.cm-chip--flag-pending': TOKEN_STYLE.flag,
    '.cm-chip--flag-cleared': { color: SLATE_400 },
    '.cm-chip--tag': {
      color: SLATE_600,
      fontWeight: '500',
      fontVariant: 'all-small-caps',
      letterSpacing: '0.04em',
    },
    '.cm-chip--amount': {
      ...TOKEN_STYLE.number,
      textAlign: 'right',
      fontVariantNumeric: 'tabular-nums',
    },
    '.cm-chip-tip': {
      padding: '4px 8px',
      fontWeight: '500',
      color: NAVY_600,
      fontFamily: SANS_STACK,
    },
    '.cm-tooltip.cm-tooltip-hover': {
      backgroundColor: '#ffffff',
      border: `1px solid ${SLATE_200}`,
      borderRadius: '4px',
      boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)',
    },
    '.cm-tooltip.cm-tooltip-autocomplete': {
      backgroundColor: '#ffffff',
      border: `1px solid ${SLATE_200}`,
      borderRadius: '6px',
      boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
      fontFamily: SANS_STACK,
      padding: '4px',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul': {
      fontFamily: SANS_STACK,
      maxHeight: '240px',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
      padding: '4px 8px',
      borderRadius: '4px',
      color: NAVY_600,
      fontSize: '12px',
      lineHeight: '1.5',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: SLATE_50,
      color: NAVY_700,
    },
    '.cm-completionIcon': {
      width: '1em',
      marginRight: '6px',
      opacity: '0.7',
      color: SLATE_500,
      fontSize: '11px',
    },
    '.cm-completionIcon-keyword:after': { content: '"/"' },
    '.cm-completionIcon-class:after': { content: '"\u25E6"' },
    '.cm-completionLabel': {
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: '12px',
    },
    '.cm-completionMatchedText': {
      textDecoration: 'none',
      color: NAVY_700,
      fontWeight: '600',
    },
    '.cm-completionDetail': {
      marginLeft: '10px',
      color: SLATE_500,
      fontStyle: 'normal',
      fontSize: '11px',
    },
    '.cm-gutters': {
      backgroundColor: PAPER_BG,
      color: SLATE_400,
      border: 'none',
      borderRight: `1px solid ${SLATE_100}`,
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 4px 0 8px' },
    '.cm-gutterElement': { borderBottom: `1px solid ${SLATE_200}` },
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

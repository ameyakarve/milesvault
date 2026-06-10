'use client'

import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView, keymap } from '@codemirror/view'
import {
  HighlightStyle,
  LRLanguage,
  LanguageSupport,
  syntaxHighlighting,
} from '@codemirror/language'
import { styleTags, tags as t } from '@lezer/highlight'
import { parser as beancountParser } from 'lezer-beancount'

const beancountLang = LRLanguage.define({
  parser: beancountParser.configure({
    props: [
      styleTags({
        Date: t.literal,
        TxnFlag: t.operator,
        String: t.string,
        Account: t.variableName,
        Number: t.number,
        Currency: t.unit,
      }),
    ],
  }),
})

const HIGHLIGHT = HighlightStyle.define([
  { tag: t.literal, color: 'var(--cm-accent)' },
  { tag: t.operator, color: 'var(--cm-text)', fontWeight: '700' },
  { tag: t.string, color: 'var(--cm-muted)' },
  { tag: t.variableName, color: 'var(--cm-text)' },
  { tag: t.number, color: 'var(--cm-number)', fontWeight: '700' },
  { tag: t.unit, color: 'var(--cm-unit)' },
])

const THEME = EditorView.theme({
  '&': {
    backgroundColor: 'var(--cm-bg)',
    fontSize: '13px',
    fontFamily: "'JetBrains Mono', monospace",
    height: '100%',
  },
  '.cm-scroller': {
    fontFamily: "'JetBrains Mono', monospace",
    overflow: 'auto',
  },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--cm-caret)', color: 'var(--cm-text)' },
  '.cm-line': { padding: '0 16px', lineHeight: '24px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'var(--cm-selection)' },
  '.cm-activeLine': { backgroundColor: 'var(--cm-active-line)' },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--cm-active-gutter)',
    color: 'var(--cm-gutter-fg)',
  },
  '.cm-focused': { outline: 'none' },
  '.cm-gutters': {
    backgroundColor: 'var(--cm-gutter-bg)',
    borderRight: '1px solid var(--cm-gutter-border)',
    color: 'var(--cm-gutter-fg)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    lineHeight: '24px',
    padding: '12px 8px 12px 0',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    display: 'flex',
    justifyContent: 'flex-end',
    minWidth: '28px',
  },
})

const BASIC = {
  lineNumbers: true,
  foldGutter: false,
  highlightActiveLine: true,
  highlightActiveLineGutter: true,
  highlightSelectionMatches: false,
  searchKeymap: true,
} as const

export function Journal({
  text,
  onChange,
  onSave,
  readOnly,
  onMount,
}: {
  text: string
  onChange: (next: string) => void
  onSave: () => void
  readOnly?: boolean
  onMount?: (view: EditorView) => void
}) {
  const extensions = useMemo(
    () => [
      new LanguageSupport(beancountLang),
      syntaxHighlighting(HIGHLIGHT),
      THEME,
      EditorView.lineWrapping,
      keymap.of([
        {
          key: 'Mod-s',
          preventDefault: true,
          run: () => {
            onSave()
            return true
          },
        },
      ]),
    ],
    [onSave],
  )

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-background">
      <CodeMirror
          theme="none"
        value={text}
        onChange={onChange}
        extensions={extensions}
        basicSetup={BASIC}
        readOnly={readOnly}
        onCreateEditor={(view) => onMount?.(view)}
        className="h-full min-h-0 flex-1 overflow-hidden"
      />
    </section>
  )
}

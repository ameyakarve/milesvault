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
  { tag: t.literal, color: '#00685f' },
  { tag: t.operator, color: '#191c1e', fontWeight: '700' },
  { tag: t.string, color: '#57657a' },
  { tag: t.variableName, color: '#191c1e' },
  { tag: t.number, color: '#3d4947', fontWeight: '700' },
  { tag: t.unit, color: '#515f74' },
])

const THEME = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    fontSize: '13px',
    fontFamily: "'JetBrains Mono', monospace",
    height: '100%',
  },
  '.cm-scroller': {
    fontFamily: "'JetBrains Mono', monospace",
    overflow: 'auto',
  },
  '.cm-content': { padding: '12px 0', caretColor: '#00685f' },
  '.cm-line': { padding: '0 16px', lineHeight: '24px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'rgba(0, 104, 95, 0.2)' },
  '.cm-activeLine': { backgroundColor: 'rgba(0, 104, 95, 0.04)' },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(0, 104, 95, 0.06)',
    color: '#475569',
  },
  '.cm-focused': { outline: 'none' },
  '.cm-gutters': {
    backgroundColor: '#f5f5f4',
    borderRight: '1px solid rgba(226, 232, 240, 0.6)',
    color: '#a8a29e',
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
    <section className="flex min-h-0 flex-1 flex-col bg-white">
      <CodeMirror
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

'use client'

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import CodeMirror, { ExternalChange } from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import {
  type AccountCompleter,
  buildScandiBeancountExtensions,
  setAccountCompleter,
  setBaseline,
  setValidators,
  type Validator,
} from './editor'

type LedgerEditorProps = {
  value: string
  onChange: (v: string) => void
  baseline?: string
  validators?: readonly Validator[]
  completeAccount?: AccountCompleter
  onCursorChange?: (pos: number) => void
  readOnly?: boolean
  className?: string
}

export type LedgerEditorHandle = {
  replaceDoc: (next: string) => void
  getView: () => EditorView | null
}

export const LedgerEditor = forwardRef<LedgerEditorHandle, LedgerEditorProps>(function LedgerEditor(
  {
    value,
    onChange,
    baseline,
    validators,
    completeAccount,
    onCursorChange,
    readOnly,
    className,
  },
  ref,
) {
  const viewRef = useRef<EditorView | null>(null)
  const cursorCbRef = useRef(onCursorChange)
  useEffect(() => {
    cursorCbRef.current = onCursorChange
  })

  useImperativeHandle(
    ref,
    () => ({
      replaceDoc: (next) => {
        const view = viewRef.current
        if (!view) return
        const current = view.state.doc.toString()
        if (current === next) return
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: next },
          annotations: [ExternalChange.of(true)],
        })
      },
      getView: () => viewRef.current,
    }),
    [],
  )

  const initialBaselineRef = useRef(baseline ?? '')
  const extensions = useMemo(
    () => [
      ...buildScandiBeancountExtensions(initialBaselineRef.current),
      EditorView.updateListener.of((u) => {
        const cb = cursorCbRef.current
        if (!cb) return
        if (u.selectionSet || u.docChanged) cb(u.state.selection.main.head)
      }),
    ],
    [],
  )

  const prevBaselineRef = useRef<string>(initialBaselineRef.current)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const next = baseline ?? ''
    if (prevBaselineRef.current === next) return
    prevBaselineRef.current = next
    view.dispatch({ effects: setBaseline(view.state, next) })
  }, [baseline])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: setValidators.of(validators ?? []) })
  }, [validators])

  useEffect(() => {
    const view = viewRef.current
    if (!view || !completeAccount) return
    view.dispatch({ effects: setAccountCompleter.of(completeAccount) })
  }, [completeAccount])

  return (
    <CodeMirror
      className={className}
      value={value}
      onChange={onChange}
      readOnly={readOnly ?? false}
      onCreateEditor={(view) => {
        viewRef.current = view
      }}
      extensions={extensions}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLine: false,
        highlightActiveLineGutter: true,
        foldGutter: true,
        foldKeymap: true,
        autocompletion: false,
        searchKeymap: false,
        bracketMatching: false,
      }}
    />
  )
})

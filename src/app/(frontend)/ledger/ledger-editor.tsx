'use client'

import { useEffect, useMemo, useRef } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import {
  type AccountCompleter,
  scandiBeancountExtensions,
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
  className?: string
}

export function LedgerEditor({
  value,
  onChange,
  baseline,
  validators,
  completeAccount,
  onCursorChange,
  className,
}: LedgerEditorProps) {
  const viewRef = useRef<EditorView | null>(null)
  const cursorCbRef = useRef(onCursorChange)
  useEffect(() => {
    cursorCbRef.current = onCursorChange
  })

  const extensions = useMemo(
    () => [
      ...scandiBeancountExtensions,
      EditorView.updateListener.of((u) => {
        const cb = cursorCbRef.current
        if (!cb) return
        if (u.selectionSet || u.docChanged) cb(u.state.selection.main.head)
      }),
    ],
    [],
  )

  const prevBaselineRef = useRef<string | null>(null)
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
      onCreateEditor={(view) => {
        viewRef.current = view
      }}
      extensions={extensions}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLine: false,
        highlightActiveLineGutter: true,
        foldGutter: false,
        autocompletion: false,
        searchKeymap: false,
        bracketMatching: false,
      }}
    />
  )
}

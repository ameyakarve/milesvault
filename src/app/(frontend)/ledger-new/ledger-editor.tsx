'use client'

import { useEffect, useMemo, useRef } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import {
  scandiBeancountExtensions,
  setBaselineBuffer,
  setValidators,
  type Validator,
} from './editor'

type LedgerEditorProps = {
  value: string
  onChange: (v: string) => void
  baseline?: string
  validators?: readonly Validator[]
  onCursorChange?: (pos: number) => void
  onCreateEditor?: (view: EditorView) => void
  className?: string
}

export function LedgerEditor({
  value,
  onChange,
  baseline,
  validators,
  onCursorChange,
  onCreateEditor,
  className,
}: LedgerEditorProps) {
  const viewRef = useRef<EditorView | null>(null)

  const cursorExtension = useMemo(
    () =>
      EditorView.updateListener.of((u) => {
        if (!onCursorChange) return
        if (u.selectionSet || u.docChanged) {
          onCursorChange(u.state.selection.main.head)
        }
      }),
    [onCursorChange],
  )

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: setBaselineBuffer.of(baseline ?? '') })
  }, [baseline])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: setValidators.of(validators ?? []) })
  }, [validators])

  return (
    <CodeMirror
      className={className}
      value={value}
      onChange={onChange}
      onCreateEditor={(view) => {
        viewRef.current = view
        if (baseline !== undefined) {
          view.dispatch({ effects: setBaselineBuffer.of(baseline) })
        }
        if (validators && validators.length > 0) {
          view.dispatch({ effects: setValidators.of(validators) })
        }
        onCreateEditor?.(view)
      }}
      extensions={[...scandiBeancountExtensions, cursorExtension]}
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

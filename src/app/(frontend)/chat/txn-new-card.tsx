'use client'

import { useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView, placeholder as placeholderExt } from '@codemirror/view'

import { beancountAutocomplete } from './beancount-autocomplete'
import { beancountLinter } from './beancount-linter'
import { beancountSupport } from './beancount-language'
import { TxnFormView } from './txn-form-view'

const editorTheme = EditorView.theme(
  {
    '&': {
      fontSize: '13px',
      backgroundColor: 'transparent',
    },
    '.cm-content': {
      fontFamily: "'SF Mono', 'Monaco', 'Menlo', monospace",
      color: '#e6e6e6',
      caretColor: '#e6e6e6',
      padding: '12px 0',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: '#555',
      border: 'none',
    },
    '.cm-activeLine': { backgroundColor: '#222' },
    '.cm-activeLineGutter': { backgroundColor: '#222' },
    '.cm-selectionBackground, ::selection': { backgroundColor: '#2a4a6a' },
    '&.cm-focused': { outline: 'none' },
    '.cm-tooltip': {
      backgroundColor: '#1a1a1a',
      border: '1px solid #5a2a2a',
      color: '#ff9999',
    },
    '.cm-diagnostic-error': {
      borderLeft: '3px solid #ff6b6b',
    },
  },
  { dark: true },
)

const PLACEHOLDER = `2026-04-15 * "Someplace" "Dinner"
  Expenses:Food:Dining           1500 INR
  Liabilities:CC:HDFC:Infinia   -1500 INR`

const cmExtensions = [
  editorTheme,
  beancountSupport,
  beancountLinter,
  beancountAutocomplete,
  placeholderExt(PLACEHOLDER),
  EditorView.lineWrapping,
]

type CreateResponse = {
  created: Array<{ index: number; id: number }>
  errors: Array<{ index: number; message: string }>
  total: number
  error?: string
  detail?: string
}

type UpdateResponse = {
  doc?: { id: number }
  error?: string
  detail?: string
}

type View = 'code' | 'form'

export function TxnNewCard({
  initialText = '',
  homeCommodityByAccount,
}: {
  initialText?: string
  homeCommodityByAccount?: Record<string, string>
}) {
  const [text, setText] = useState(initialText)
  const [view, setView] = useState<View>('form')
  const [savedId, setSavedId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirm = async () => {
    setError(null)
    if (!text.trim()) {
      setError('Empty transaction')
      return
    }
    setBusy(true)
    try {
      if (savedId == null) {
        const res = await fetch('/api/beancount/txns', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
        const data = (await res.json()) as CreateResponse
        if (!res.ok && res.status !== 207) {
          throw new Error(data.detail || data.error || `HTTP ${res.status}`)
        }
        if (data.errors && data.errors.length > 0) {
          throw new Error(data.errors[0].message)
        }
        if (!data.created || data.created.length === 0) {
          throw new Error('No transaction created')
        }
        setSavedId(data.created[0].id)
      } else {
        const res = await fetch(`/api/beancount/txns/${savedId}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
        const data = (await res.json()) as UpdateResponse
        if (!res.ok) {
          throw new Error(data.detail || data.error || `HTTP ${res.status}`)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const isSaved = savedId != null

  return (
    <div className={`txn-card ${isSaved ? 'txn-card-saved' : ''}`}>
      <div className="txn-card-header">
        {isSaved ? (
          <span className="txn-card-badge">saved #{savedId}</span>
        ) : (
          <span className="txn-card-badge txn-card-badge-draft">new</span>
        )}
        <div className="txn-card-view-toggle" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'code'}
            className={view === 'code' ? 'active' : ''}
            onClick={() => setView('code')}
          >
            Code
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'form'}
            className={view === 'form' ? 'active' : ''}
            onClick={() => setView('form')}
          >
            Form
          </button>
        </div>
      </div>
      {view === 'code' ? (
        <div className="txn-card-editor">
          <CodeMirror
            value={text}
            onChange={(v) => setText(v)}
            editable={!busy}
            extensions={cmExtensions}
            basicSetup={{
              lineNumbers: true,
              foldGutter: false,
              highlightActiveLineGutter: true,
              highlightActiveLine: true,
              bracketMatching: false,
              indentOnInput: false,
              autocompletion: false,
            }}
            theme="dark"
          />
        </div>
      ) : (
        <TxnFormView
          text={text}
          onChange={busy ? undefined : setText}
          homeCommodityByAccount={homeCommodityByAccount}
        />
      )}
      {error && <div className="txn-card-error">{error}</div>}
      <div className="txn-card-actions">
        <button type="button" onClick={confirm} disabled={busy} title={isSaved ? 'Update' : 'Save'}>
          {isSaved ? '✓ Update' : '✓ Save'}
        </button>
      </div>
    </div>
  )
}

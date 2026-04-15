'use client'

import { useState } from 'react'

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

const PLACEHOLDER = `2026-04-15 * "Someplace" "Dinner"
  Expenses:Food:Dining           1500 INR
  Liabilities:CC:HDFC:Infinia   -1500 INR`

export function TxnNewCard({ initialText = '' }: { initialText?: string }) {
  const [text, setText] = useState(initialText)
  const [view, setView] = useState<View>('code')
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
  const rows = Math.max(5, text.split('\n').length + 1)

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
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          readOnly={busy}
          spellCheck={false}
          placeholder={PLACEHOLDER}
          rows={rows}
        />
      ) : (
        <div className="txn-card-form-empty">Form view coming soon</div>
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

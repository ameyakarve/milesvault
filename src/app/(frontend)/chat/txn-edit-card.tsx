'use client'

import { useMemo, useState } from 'react'

type Posting = {
  account: string
  amount: number
  commodity: string
}

type Draft = {
  date: string
  flag?: string
  payee?: string
  narration?: string
  postings: Posting[]
}

function formatDraft(d: Draft): string {
  const header = [
    d.date,
    d.flag || '*',
    d.payee ? `"${d.payee}"` : '',
    d.narration ? `"${d.narration}"` : '',
  ]
    .filter(Boolean)
    .join(' ')
  const postingLines = (d.postings || []).map((p) => {
    const acct = p.account.padEnd(42)
    const amt = p.amount.toString().padStart(12)
    return `  ${acct}${amt} ${p.commodity}`
  })
  return [header, ...postingLines].join('\n')
}

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

type DeleteErrorResponse = { errors?: Array<{ message: string }>; message?: string }

export function TxnEditCard({
  initialDraft,
  locked = false,
}: {
  initialDraft: Draft
  locked?: boolean
}) {
  const initialText = useMemo(() => formatDraft(initialDraft), [initialDraft])
  const [text, setText] = useState(initialText)
  const [savedId, setSavedId] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (dismissed) return null

  const confirm = async () => {
    setError(null)
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

  const remove = async () => {
    setError(null)
    if (savedId == null) {
      setDismissed(true)
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/txns/${savedId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = (await res.json()) as DeleteErrorResponse
        throw new Error(data.errors?.[0]?.message || `HTTP ${res.status}`)
      }
      setDismissed(true)
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
          <span className="txn-card-badge txn-card-badge-draft">draft</span>
        )}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={locked || busy}
        spellCheck={false}
        rows={Math.max(3, text.split('\n').length + 1)}
      />
      {error && <div className="txn-card-error">{error}</div>}
      <div className="txn-card-actions">
        <button type="button" onClick={confirm} disabled={busy || locked} title={isSaved ? 'Update' : 'Confirm'}>
          {isSaved ? '✓ Update' : '✓ Confirm'}
        </button>
        <button type="button" onClick={remove} disabled={busy} title="Delete">
          🗑 Delete
        </button>
      </div>
    </div>
  )
}

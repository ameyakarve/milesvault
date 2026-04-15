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
    return `    ${acct}${amt} ${p.commodity}`
  })
  return [header, ...postingLines].join('\n')
}

function parseDraft(text: string): Draft | { error: string } {
  const lines = text.split('\n').map((l) => l.trimEnd()).filter((l) => l.length > 0)
  if (lines.length < 2) return { error: 'Need a header and at least 2 postings' }
  const headerRegex = /^(\d{4}-\d{2}-\d{2})\s+(\S)(?:\s+"([^"]*)")?(?:\s+"([^"]*)")?$/
  const h = lines[0].match(headerRegex)
  if (!h) return { error: `Malformed header: ${lines[0]}` }
  const [, date, flag, payee, narration] = h

  const postings: Posting[] = []
  for (let i = 1; i < lines.length; i++) {
    const m = lines[i].trim().match(/^(\S+)\s+(-?\d+(?:\.\d+)?)\s+(\S+)$/)
    if (!m) return { error: `Malformed posting: ${lines[i]}` }
    postings.push({ account: m[1], amount: parseFloat(m[2]), commodity: m[3] })
  }
  if (postings.length < 2) return { error: 'Need at least 2 postings' }
  return { date, flag, payee, narration, postings }
}

type AccountsResponse = { docs: Array<{ id: number; path: string }> }
type CommoditiesResponse = { docs: Array<{ id: number; code: string }> }
type TxnCreateResponse = { doc: { id: number }; errors?: Array<{ message: string }> }
type TxnErrorResponse = { errors?: Array<{ message: string }>; message?: string }

async function resolveLookups(): Promise<{
  accounts: Map<string, number>
  commodities: Map<string, number>
}> {
  const [acctRes, ccyRes] = await Promise.all([
    fetch('/api/accounts?limit=500&depth=0', { credentials: 'include' }),
    fetch('/api/commodities?limit=500&depth=0', { credentials: 'include' }),
  ])
  const acct = (await acctRes.json()) as AccountsResponse
  const ccy = (await ccyRes.json()) as CommoditiesResponse
  return {
    accounts: new Map(acct.docs.map((a) => [a.path, a.id])),
    commodities: new Map(ccy.docs.map((c) => [c.code, c.id])),
  }
}

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
      const parsed = parseDraft(text)
      if ('error' in parsed) throw new Error(parsed.error)

      const { accounts, commodities } = await resolveLookups()

      const postings = parsed.postings.map((p) => {
        const acctId = accounts.get(p.account)
        if (acctId == null) throw new Error(`Unknown account: ${p.account}`)
        const ccyId = commodities.get(p.commodity)
        if (ccyId == null) throw new Error(`Unknown commodity: ${p.commodity}`)
        return { account: acctId, amountNumber: p.amount, amountCommodity: ccyId }
      })

      const res = await fetch('/api/txns', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: parsed.date,
          flag: parsed.flag,
          payee: parsed.payee,
          narration: parsed.narration,
          postings,
        }),
      })
      const data = (await res.json()) as TxnCreateResponse & TxnErrorResponse
      if (!res.ok) {
        const msg = data.errors?.[0]?.message || data.message || `HTTP ${res.status}`
        throw new Error(msg)
      }
      setSavedId(data.doc.id)
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
        const data = (await res.json()) as TxnErrorResponse
        throw new Error(data.errors?.[0]?.message || `HTTP ${res.status}`)
      }
      setDismissed(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const cancel = () => {
    if (savedId != null) return
    setDismissed(true)
  }

  const isSaved = savedId != null

  return (
    <div className={`txn-card ${isSaved ? 'txn-card-saved' : ''}`}>
      <div className="txn-card-header">
        {isSaved ? <span className="txn-card-badge">saved #{savedId}</span> : <span className="txn-card-badge txn-card-badge-draft">draft</span>}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={locked || isSaved || busy}
        spellCheck={false}
        rows={Math.max(3, text.split('\n').length + 1)}
      />
      {error && <div className="txn-card-error">{error}</div>}
      <div className="txn-card-actions">
        {!isSaved && (
          <>
            <button type="button" onClick={confirm} disabled={busy || locked} title="Confirm">
              ✓ Confirm
            </button>
            <button type="button" onClick={cancel} disabled={busy} title="Cancel">
              ✕ Cancel
            </button>
          </>
        )}
        <button type="button" onClick={remove} disabled={busy} title="Delete">
          🗑 Delete
        </button>
      </div>
    </div>
  )
}

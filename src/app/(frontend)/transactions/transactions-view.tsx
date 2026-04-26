'use client'

import { useCallback, useEffect, useState } from 'react'
import type { TransactionV2, V2ListResult } from '@/durable/ledger-v2-types'

const API = '/api/ledger/v2/transactions'

type ListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; rows: TransactionV2[]; total: number }
  | { status: 'error'; message: string }

const today = (): string => new Date().toISOString().slice(0, 10)

const blankDraft = (): string =>
  `${today()} * "" ""\n  Assets:Bank:Checking  -100.00 USD\n  Expenses:Misc       100.00 USD\n`

export function TransactionsView() {
  const [list, setList] = useState<ListState>({ status: 'idle' })
  const [editing, setEditing] = useState<{ id: number; expected: number } | null>(null)
  const [draft, setDraft] = useState<string>(blankDraft())
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const refresh = useCallback(async () => {
    setList({ status: 'loading' })
    try {
      const res = await fetch(`${API}?limit=100`, { credentials: 'include' })
      if (!res.ok) throw new Error(`list ${res.status}`)
      const data = (await res.json()) as V2ListResult
      setList({ status: 'ready', rows: data.rows, total: data.total })
    } catch (e) {
      setList({ status: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const resetDraft = () => {
    setEditing(null)
    setDraft(blankDraft())
    setErrors([])
  }

  const startEdit = (t: TransactionV2) => {
    setEditing({ id: t.id, expected: t.updated_at })
    setDraft(t.raw_text)
    setErrors([])
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrors([])
    try {
      let res: Response
      if (editing) {
        res = await fetch(`${API}/${editing.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ raw_text: draft, expected_updated_at: editing.expected }),
        })
      } else {
        res = await fetch(API, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ raw_text: draft }),
        })
      }
      if (res.status === 409) {
        setErrors(['conflict — this transaction was modified elsewhere; refresh to see latest.'])
        return
      }
      if (!res.ok) {
        const text = await res.text()
        try {
          const parsed = JSON.parse(text) as { errors?: string[] }
          setErrors(parsed.errors ?? [text])
        } catch {
          setErrors([text || `${res.status}`])
        }
        return
      }
      resetDraft()
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async (t: TransactionV2) => {
    if (!confirm(`delete txn #${t.id} (${t.date} ${t.payee || t.narration})?`)) return
    setBusy(true)
    try {
      const res = await fetch(
        `${API}/${t.id}?expected_updated_at=${t.updated_at}`,
        { method: 'DELETE', credentials: 'include' },
      )
      if (res.status === 409) {
        setErrors(['conflict — this transaction was modified elsewhere; refresh to see latest.'])
        return
      }
      if (!res.ok) {
        setErrors([`delete failed: ${res.status}`])
        return
      }
      if (editing?.id === t.id) resetDraft()
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-scandi-quiet px-6 py-8">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <header className="flex items-baseline justify-between">
          <h1 className="font-mono text-sm uppercase tracking-[0.12em] text-navy-700">
            transactions · v2
          </h1>
          <span className="font-mono text-[10px] text-slate-500 uppercase tracking-[0.08em]">
            {list.status === 'ready' ? `${list.total} total` : list.status}
          </span>
        </header>

        <section className="border border-scandi-rule bg-white p-4">
          <header className="flex items-center justify-between mb-3">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-slate-500">
              {editing ? `edit #${editing.id}` : 'new transaction'}
            </h2>
            <span className="font-mono text-[10px] text-slate-400">beancount</span>
          </header>
          <form onSubmit={onSubmit} className="flex flex-col gap-3 font-mono text-[11px]">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              rows={8}
              className="border border-scandi-rule px-3 py-2 w-full font-mono text-[12px] leading-relaxed text-navy-700 focus:outline-none focus:border-scandi-accent"
              placeholder='2026-04-26 * "Payee" "Narration"&#10;  Assets:Bank:Checking  -100.00 USD&#10;  Expenses:Misc       100.00 USD'
            />
            {errors.length > 0 ? (
              <div className="border border-red-200 bg-red-50 px-3 py-2 text-red-700 flex flex-col gap-1">
                {errors.map((m, i) => (
                  <p key={i}>{m}</p>
                ))}
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                className="bg-scandi-accent text-white px-3 py-1 hover:bg-scandi-accent-hover disabled:opacity-40"
              >
                {busy ? '…' : editing ? 'save' : 'create'}
              </button>
              {editing ? (
                <button
                  type="button"
                  onClick={resetDraft}
                  className="px-3 py-1 border border-scandi-rule text-navy-700 hover:bg-scandi-quiet"
                >
                  cancel
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section className="border border-scandi-rule bg-white">
          <header className="flex items-center justify-between px-4 py-3 border-b border-scandi-rule">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-slate-500">
              ledger
            </h2>
            <button
              type="button"
              onClick={() => void refresh()}
              className="font-mono text-[10px] text-slate-500 hover:text-navy-700 uppercase tracking-[0.08em]"
            >
              refresh
            </button>
          </header>
          {list.status === 'loading' ? (
            <p className="px-4 py-6 font-mono text-[11px] text-slate-500">loading…</p>
          ) : list.status === 'error' ? (
            <p className="px-4 py-6 font-mono text-[11px] text-red-600">{list.message}</p>
          ) : list.status === 'ready' && list.rows.length === 0 ? (
            <p className="px-4 py-6 font-mono text-[11px] text-slate-500">
              no transactions yet — create one above.
            </p>
          ) : list.status === 'ready' ? (
            <ul className="divide-y divide-scandi-rule">
              {list.rows.map((t) => (
                <Row
                  key={t.id}
                  txn={t}
                  isEditing={editing?.id === t.id}
                  onEdit={() => startEdit(t)}
                  onDelete={() => void onDelete(t)}
                />
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </div>
  )
}

type RowProps = {
  txn: TransactionV2
  isEditing: boolean
  onEdit: () => void
  onDelete: () => void
}

function Row({ txn, isEditing, onEdit, onDelete }: RowProps) {
  return (
    <li
      className={`px-4 py-3 font-mono text-[11px] flex flex-col gap-1 ${
        isEditing ? 'bg-scandi-quiet' : ''
      }`}
    >
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-slate-500 shrink-0">{txn.date}</span>
          <span className="text-slate-400 shrink-0">{txn.flag ?? ' '}</span>
          <span className="text-navy-700 truncate">
            {txn.payee ? `"${txn.payee}" ` : ''}
            {txn.narration ? `"${txn.narration}"` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            className="text-[10px] uppercase tracking-[0.08em] text-slate-500 hover:text-navy-700"
          >
            edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-[10px] uppercase tracking-[0.08em] text-slate-500 hover:text-red-600"
          >
            delete
          </button>
        </div>
      </header>
      <pre className="whitespace-pre text-slate-600 leading-relaxed">{txn.raw_text.trimEnd()}</pre>
    </li>
  )
}

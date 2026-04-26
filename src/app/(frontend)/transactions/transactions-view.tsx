'use client'

import { useCallback, useEffect, useState } from 'react'
import type {
  PostingInput,
  TransactionInput,
  TransactionV2,
  V2ListResult,
} from '@/durable/ledger-v2-types'

const API = '/api/ledger/v2/transactions'

type ListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; rows: TransactionV2[]; total: number }
  | { status: 'error'; message: string }

const today = (): string => new Date().toISOString().slice(0, 10)

const blankPosting = (): PostingInput => ({
  account: '',
  amount: '',
  currency: '',
})

const blankInput = (): TransactionInput => ({
  date: today(),
  flag: '*',
  payee: '',
  narration: '',
  postings: [blankPosting(), blankPosting()],
  tags: [],
  links: [],
})

export function TransactionsView() {
  const [list, setList] = useState<ListState>({ status: 'idle' })
  const [editing, setEditing] = useState<{ id: number; expected: number } | null>(null)
  const [draft, setDraft] = useState<TransactionInput>(blankInput())
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
    setDraft(blankInput())
    setErrors([])
  }

  const startEdit = (t: TransactionV2) => {
    setEditing({ id: t.id, expected: t.updated_at })
    setDraft({
      date: t.date,
      flag: t.flag,
      payee: t.payee,
      narration: t.narration,
      postings: t.postings.map((p) => ({
        account: p.account,
        flag: p.flag,
        amount: p.amount,
        currency: p.currency,
        cost_raw: p.cost_raw,
        price_at_signs: p.price_at_signs,
        price_amount: p.price_amount,
        price_currency: p.price_currency,
        comment: p.comment,
        meta: p.meta,
      })),
      tags: [...t.tags],
      links: [...t.links],
      meta: { ...t.meta },
    })
    setErrors([])
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrors([])
    try {
      const cleaned: TransactionInput = {
        ...draft,
        postings: draft.postings.map((p) => ({
          account: p.account.trim(),
          flag: p.flag || null,
          amount: p.amount?.trim() ? p.amount.trim() : null,
          currency: p.currency?.trim() ? p.currency.trim() : null,
          cost_raw: p.cost_raw ?? null,
          price_at_signs: p.price_at_signs ?? 0,
          price_amount: p.price_amount ?? null,
          price_currency: p.price_currency ?? null,
          comment: p.comment ?? null,
          meta: p.meta ?? null,
        })),
        payee: draft.payee?.trim() || '',
        narration: draft.narration?.trim() || '',
      }
      let res: Response
      if (editing) {
        res = await fetch(`${API}/${editing.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...cleaned, expected_updated_at: editing.expected }),
        })
      } else {
        res = await fetch(API, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(cleaned),
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
          <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-slate-500 mb-3">
            {editing ? `edit #${editing.id}` : 'new transaction'}
          </h2>
          <Form
            value={draft}
            onChange={setDraft}
            onSubmit={onSubmit}
            onCancel={editing ? resetDraft : undefined}
            busy={busy}
            errors={errors}
            submitLabel={editing ? 'save' : 'create'}
          />
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

type FormProps = {
  value: TransactionInput
  onChange: (v: TransactionInput) => void
  onSubmit: (e: React.FormEvent) => void
  onCancel?: () => void
  busy: boolean
  errors: string[]
  submitLabel: string
}

function Form({ value, onChange, onSubmit, onCancel, busy, errors, submitLabel }: FormProps) {
  const updatePosting = (i: number, patch: Partial<PostingInput>) => {
    const next = value.postings.map((p, idx) => (idx === i ? { ...p, ...patch } : p))
    onChange({ ...value, postings: next })
  }
  const addPosting = () => onChange({ ...value, postings: [...value.postings, blankPosting()] })
  const removePosting = (i: number) => {
    if (value.postings.length <= 2) return
    onChange({ ...value, postings: value.postings.filter((_, idx) => idx !== i) })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 font-mono text-[11px]">
      <div className="grid grid-cols-[140px_60px_1fr_1fr] gap-2">
        <Field label="date">
          <input
            type="date"
            value={value.date}
            onChange={(e) => onChange({ ...value, date: e.target.value })}
            className="border border-scandi-rule px-2 py-1 w-full"
            required
          />
        </Field>
        <Field label="flag">
          <select
            value={value.flag ?? ''}
            onChange={(e) =>
              onChange({ ...value, flag: (e.target.value || null) as '*' | '!' | null })
            }
            className="border border-scandi-rule px-2 py-1 w-full"
          >
            <option value="*">*</option>
            <option value="!">!</option>
            <option value="">—</option>
          </select>
        </Field>
        <Field label="payee">
          <input
            value={value.payee ?? ''}
            onChange={(e) => onChange({ ...value, payee: e.target.value })}
            className="border border-scandi-rule px-2 py-1 w-full"
          />
        </Field>
        <Field label="narration">
          <input
            value={value.narration ?? ''}
            onChange={(e) => onChange({ ...value, narration: e.target.value })}
            className="border border-scandi-rule px-2 py-1 w-full"
          />
        </Field>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.08em] text-slate-500">postings</span>
        {value.postings.map((p, i) => (
          <div key={i} className="grid grid-cols-[2fr_1fr_80px_30px] gap-2 items-center">
            <input
              placeholder="Assets:Bank:Checking"
              value={p.account}
              onChange={(e) => updatePosting(i, { account: e.target.value })}
              className="border border-scandi-rule px-2 py-1"
              required
            />
            <input
              placeholder="amount"
              value={p.amount ?? ''}
              onChange={(e) => updatePosting(i, { amount: e.target.value })}
              className="border border-scandi-rule px-2 py-1"
            />
            <input
              placeholder="USD"
              value={p.currency ?? ''}
              onChange={(e) => updatePosting(i, { currency: e.target.value.toUpperCase() })}
              className="border border-scandi-rule px-2 py-1"
            />
            <button
              type="button"
              onClick={() => removePosting(i)}
              disabled={value.postings.length <= 2}
              className="text-slate-400 hover:text-red-600 disabled:opacity-30 text-[14px]"
              title="remove posting"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addPosting}
          className="self-start mt-1 text-[10px] uppercase tracking-[0.08em] text-slate-500 hover:text-navy-700"
        >
          + posting
        </button>
      </div>

      {errors.length > 0 ? (
        <ul className="border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-[11px] flex flex-col gap-1">
          {errors.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center gap-2 mt-1">
        <button
          type="submit"
          disabled={busy}
          className="bg-scandi-accent text-white px-3 py-1 hover:bg-scandi-accent-hover disabled:opacity-40"
        >
          {busy ? '…' : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1 border border-scandi-rule text-navy-700 hover:bg-scandi-quiet"
          >
            cancel
          </button>
        ) : null}
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.08em] text-slate-500">{label}</span>
      {children}
    </label>
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

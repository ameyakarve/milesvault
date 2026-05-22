'use client'

import { useEffect, useMemo, useState } from 'react'
import type {
  PostingSearchFilter,
  PostingSearchResponse,
  PostingSearchRow,
} from '@/lib/ledger-core/posting-search'
import { ExploreGrid, type GridControls } from './explore-grid'
import type { DraftPatch } from './cell-narrow'

const VISIBLE_ROW_CAP = 500
const DEBOUNCE_MS = 250

type ViewMode = 'grid' | 'table'

export function ExploreShell() {
  const [draft, setDraft] = useState<DraftFilter>(emptyDraft())
  const [data, setData] = useState<PostingSearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('grid')
  const [gridCtl, setGridCtl] = useState<GridControls>({
    x: { kind: 'month' },
    y: { kind: 'account_child', account_scope: '' },
  })

  const filter = useMemo(() => buildFilter(draft), [draft])

  const applyPatch = (patch: DraftPatch) => setDraft({ ...draft, ...patch })

  useEffect(() => {
    let cancelled = false
    const id = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/ledger/postings/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(filter),
        })
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`)
        }
        const json = (await res.json()) as PostingSearchResponse
        if (!cancelled) setData(json)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [filter])

  return (
    <div className="flex flex-1 overflow-hidden">
      <FilterSidebar draft={draft} setDraft={setDraft} />
      <section className="flex flex-1 flex-col overflow-hidden">
        <ResultsToolbar
          data={data}
          loading={loading}
          error={error}
          view={view}
          setView={setView}
        />
        {view === 'grid' ? (
          <ExploreGrid
            rows={data?.rows ?? []}
            controls={gridCtl}
            setControls={setGridCtl}
            onNarrow={applyPatch}
          />
        ) : (
          <ResultsTable rows={data?.rows ?? []} />
        )}
      </section>
    </div>
  )
}

// ---------- filter draft & translation ----------

type DraftFilter = {
  date_from: string
  date_to: string
  account_prefix: string
  currency: string
  amount_gte: string
  amount_lte: string
  sign: 'any' | 'debit' | 'credit'
  payee_q: string
  flag: 'any' | '*' | '!'
}

function emptyDraft(): DraftFilter {
  return {
    date_from: '',
    date_to: '',
    account_prefix: '',
    currency: '',
    amount_gte: '',
    amount_lte: '',
    sign: 'any',
    payee_q: '',
    flag: 'any',
  }
}

function buildFilter(d: DraftFilter): PostingSearchFilter {
  const f: PostingSearchFilter = {}
  if (d.date_from || d.date_to) {
    f.date = {}
    if (d.date_from) f.date.from = d.date_from
    if (d.date_to) f.date.to = d.date_to
  }
  if (d.account_prefix.trim()) f.accounts = { prefix: [d.account_prefix.trim()] }
  if (d.currency.trim()) f.currencies = [d.currency.trim().toUpperCase()]
  const gte = Number(d.amount_gte)
  const lte = Number(d.amount_lte)
  if (Number.isFinite(gte) && d.amount_gte !== '') {
    f.amount = { ...(f.amount ?? {}), signed: { ...(f.amount?.signed ?? {}), gte } }
  }
  if (Number.isFinite(lte) && d.amount_lte !== '') {
    f.amount = { ...(f.amount ?? {}), signed: { ...(f.amount?.signed ?? {}), lte } }
  }
  if (d.sign === 'debit' || d.sign === 'credit') f.sign = d.sign
  if (d.payee_q.trim()) f.payee_q = d.payee_q.trim()
  if (d.flag === '*' || d.flag === '!') f.flag = d.flag
  return f
}

// ---------- filter sidebar ----------

function FilterSidebar({
  draft,
  setDraft,
}: {
  draft: DraftFilter
  setDraft: (next: DraftFilter) => void
}) {
  const update = <K extends keyof DraftFilter>(key: K, value: DraftFilter[K]) =>
    setDraft({ ...draft, [key]: value })

  return (
    <aside className="w-[280px] shrink-0 overflow-y-auto border-r border-slate-200 p-4">
      <SectionLabel>Date</SectionLabel>
      <div className="flex gap-2">
        <DateInput
          value={draft.date_from}
          onChange={(v) => update('date_from', v)}
          aria-label="from"
        />
        <DateInput
          value={draft.date_to}
          onChange={(v) => update('date_to', v)}
          aria-label="to (exclusive)"
        />
      </div>

      <SectionLabel>Account prefix</SectionLabel>
      <TextInput
        value={draft.account_prefix}
        onChange={(v) => update('account_prefix', v)}
        placeholder="Expenses:Dining"
      />

      <SectionLabel>Payee / narration</SectionLabel>
      <TextInput
        value={draft.payee_q}
        onChange={(v) => update('payee_q', v)}
        placeholder="substring…"
      />

      <SectionLabel>Currency</SectionLabel>
      <TextInput
        value={draft.currency}
        onChange={(v) => update('currency', v)}
        placeholder="INR"
      />

      <SectionLabel>Amount</SectionLabel>
      <div className="flex gap-2">
        <NumberInput
          value={draft.amount_gte}
          onChange={(v) => update('amount_gte', v)}
          placeholder="≥"
        />
        <NumberInput
          value={draft.amount_lte}
          onChange={(v) => update('amount_lte', v)}
          placeholder="≤"
        />
      </div>

      <SectionLabel>Sign</SectionLabel>
      <SegmentedGroup
        value={draft.sign}
        onChange={(v) => update('sign', v as DraftFilter['sign'])}
        options={[
          { value: 'any', label: 'Any' },
          { value: 'debit', label: 'Debit' },
          { value: 'credit', label: 'Credit' },
        ]}
      />

      <SectionLabel>Flag</SectionLabel>
      <SegmentedGroup
        value={draft.flag}
        onChange={(v) => update('flag', v as DraftFilter['flag'])}
        options={[
          { value: 'any', label: 'Any' },
          { value: '*', label: 'Cleared' },
          { value: '!', label: 'Pending' },
        ]}
      />

      <button
        type="button"
        onClick={() => setDraft(emptyDraft())}
        className="mt-6 w-full rounded-[8px] border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
      >
        Reset
      </button>
    </aside>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 mb-1 text-[11px] uppercase tracking-wide text-slate-400">
      {children}
    </div>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-[8px] border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-teal-500"
    />
  )
}

function NumberInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-[8px] border border-slate-200 bg-white px-2 py-1.5 text-xs tabular-nums text-slate-900 placeholder:text-slate-400 outline-none focus:border-teal-500"
    />
  )
}

function DateInput({
  value,
  onChange,
  ...rest
}: {
  value: string
  onChange: (v: string) => void
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-[8px] border border-slate-200 bg-white px-2 py-1.5 text-xs tabular-nums text-slate-900 placeholder:text-slate-400 outline-none focus:border-teal-500"
      {...rest}
    />
  )
}

function SegmentedGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="inline-flex w-full overflow-hidden rounded-[8px] border border-slate-200">
      {options.map((o, i) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex-1 px-2 py-1.5 text-xs transition ${
              active
                ? 'bg-teal-500 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            } ${i > 0 ? 'border-l border-slate-200' : ''}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ---------- results ----------

function ResultsToolbar({
  data,
  loading,
  error,
  view,
  setView,
}: {
  data: PostingSearchResponse | null
  loading: boolean
  error: string | null
  view: ViewMode
  setView: (v: ViewMode) => void
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3 text-xs text-slate-600">
      <div className="flex items-center gap-3">
        {loading && <span className="text-slate-400">Loading…</span>}
        {!loading && data && (
          <span>
            {data.rows.length.toLocaleString()} postings
            {data.truncated && (
              <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700 border border-amber-200">
                truncated at {data.limit.toLocaleString()} — narrow filters
              </span>
            )}
            {view === 'table' && data.rows.length > VISIBLE_ROW_CAP && (
              <span className="ml-2 text-slate-400">
                (showing first {VISIBLE_ROW_CAP})
              </span>
            )}
          </span>
        )}
        {error && <span className="text-rose-600">{error}</span>}
      </div>
      <div className="inline-flex overflow-hidden rounded-[6px] border border-slate-200">
        {(['grid', 'table'] as ViewMode[]).map((m, i) => {
          const active = m === view
          return (
            <button
              key={m}
              type="button"
              onClick={() => setView(m)}
              className={`px-3 py-1 transition ${
                active ? 'bg-teal-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              } ${i > 0 ? 'border-l border-slate-200' : ''}`}
            >
              {m === 'grid' ? 'Grid' : 'Table'}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ResultsTable({ rows }: { rows: PostingSearchRow[] }) {
  const visible = rows.slice(0, VISIBLE_ROW_CAP)
  if (visible.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-slate-400">
        No matching postings.
      </div>
    )
  }
  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full text-xs tabular-nums">
        <thead className="sticky top-0 bg-white border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-6 py-2 font-normal">Date</th>
            <th className="px-2 py-2 font-normal">Payee / narration</th>
            <th className="px-2 py-2 font-normal">Account</th>
            <th className="px-2 py-2 text-right font-normal">Amount</th>
            <th className="px-6 py-2 font-normal">Ccy</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr
              key={`${r.txn_id}:${r.idx}`}
              className="border-b border-slate-100 hover:bg-slate-50"
            >
              <td className="px-6 py-1.5 text-slate-700">{r.date}</td>
              <td className="px-2 py-1.5 text-slate-900 max-w-[28ch] truncate">
                {r.payee || r.narration || '—'}
              </td>
              <td className="px-2 py-1.5 text-slate-600 max-w-[28ch] truncate">
                {r.account}
              </td>
              <td
                className={`px-2 py-1.5 text-right ${
                  r.amount.startsWith('-') ? 'text-rose-700' : 'text-teal-700'
                }`}
              >
                {r.amount}
              </td>
              <td className="px-6 py-1.5 text-slate-500">{r.currency}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

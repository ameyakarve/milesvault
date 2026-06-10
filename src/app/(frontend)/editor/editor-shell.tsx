'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { Eraser } from 'lucide-react'
import { Chat } from './chat'
import { Journal } from './journal'
import {
  JournalFilterBar,
  thisMonthRange,
  type JournalFilter,
} from './journal-filter-bar'
import { useEntries, composeBaseline, diffBuffer } from './use-entries'
import {
  ledgerClient,
  isReplaceBufferError,
} from '@/lib/ledger-client-browser'
import type { EntryRow, JournalCursor } from '@/durable/ledger-do'

type Tab = 'chat' | 'journal'

export function EditorShell() {
  const [tab, setTab] = useState<Tab>('chat')
  const [pendingTab, setPendingTab] = useState<Tab | null>(null)
  // Chat opens a WebSocket via useAgent/useAgentChat; its first render depends
  // on live socket state that can't exist during SSR, so server HTML and the
  // first client render diverge (React #418 hydration mismatch). Mount it only
  // after hydration so both renders agree on "not yet present."
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const entries = useEntries()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [chatBusy, setChatBusy] = useState(false)
  const [chatClear, setChatClear] = useState<{
    canClear: boolean
    clear: () => void
  }>({ canClear: false, clear: () => {} })
  const editorViewRef = useRef<EditorView | null>(null)

  const [filter, setFilter] = useState<JournalFilter>(() => ({
    account: null,
    date: thisMonthRange(),
  }))
  const filterActive = filter.account != null || filter.date != null

  // Deep links: /editor?tab=journal&account=Assets:… opens the Journal
  // pre-filtered to that account — the Vault's provenance links. Date filter
  // drops so the account's full history shows. Runs once after hydration
  // (nothing is dirty or streaming yet, so switching tabs directly is safe).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const account = p.get('account')
    const from = p.get('from')
    const to = p.get('to')
    if (p.get('tab') === 'journal' || account) setTab('journal')
    if (account) setFilter({ account, date: from && to ? { from, to } : null })
  }, [])

  const [filteredRows, setFilteredRows] = useState<EntryRow[]>([])
  const [filteredBuffer, setFilteredBuffer] = useState('')
  const [filteredCursor, setFilteredCursor] = useState<JournalCursor | null>(null)
  const [filteredLoading, setFilteredLoading] = useState(false)
  const [filteredSaving, setFilteredSaving] = useState(false)
  const [filteredError, setFilteredError] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<string[]>([])

  const filteredBaseline = useMemo(
    () => composeBaseline(filteredRows),
    [filteredRows],
  )
  const filteredDirty = filteredBuffer !== filteredBaseline && filteredRows.length > 0

  useEffect(() => {
    let alive = true
    ledgerClient
      .getAccounts()
      .then((r) => {
        if (alive) setAccounts(r.accounts)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // Refetch filtered view whenever filter or unfiltered save bumps the
  // entries snapshot. We piggyback on entries.rows so any global change
  // (chat append, unfiltered save) refreshes the filtered slice.
  useEffect(() => {
    if (tab !== 'journal') return
    if (!filterActive) return
    let alive = true
    setFilteredLoading(true)
    setFilteredError(null)
    ledgerClient
      .getJournalFiltered({
        account: filter.account,
        dateFrom: filter.date?.from ?? null,
        dateTo: filter.date?.to ?? null,
        cursor: null,
      })
      .then(async (r) => {
        if (!alive) return
        // Backfill snapshot identity for the filtered slice by intersecting
        // against the full entries list. The full list carries kind+id+updated_at;
        // the filtered text endpoint only returns rendered text. We diff by
        // re-parsing — for now, derive snapshots by filtering the global rows
        // against the filter predicates client-side.
        const visible = filterRowsClientSide(entries.rows, filter)
        setFilteredRows(visible)
        setFilteredBuffer(composeBaseline(visible))
        setFilteredCursor(r.nextCursor)
      })
      .catch((e) => {
        if (!alive) return
        setFilteredError(
          e instanceof Error ? e.message : 'Failed to load filtered journal',
        )
      })
      .finally(() => {
        if (alive) setFilteredLoading(false)
      })
    return () => {
      alive = false
    }
  }, [tab, filterActive, filter.account, filter.date, entries.rows])

  const loadMore = useCallback(async () => {
    // Pagination on the filtered view is read-only: it brings in further
    // rendered text the user can review. To keep edits round-trippable we
    // only allow saving the first page (where filteredRows is the source of
    // truth). Loading more switches the view into a read-only mode.
    if (!filteredCursor || filteredLoading) return
    setFilteredLoading(true)
    try {
      const r = await ledgerClient.getJournalFiltered({
        account: filter.account,
        dateFrom: filter.date?.from ?? null,
        dateTo: filter.date?.to ?? null,
        cursor: filteredCursor,
      })
      setFilteredBuffer((prev) => (prev ? `${prev}\n${r.text}` : r.text))
      setFilteredRows([])
      setFilteredCursor(r.nextCursor)
    } catch (e) {
      setFilteredError(e instanceof Error ? e.message : 'Failed to load more')
    } finally {
      setFilteredLoading(false)
    }
  }, [filteredCursor, filteredLoading, filter.account, filter.date])

  const isDirty = entries.isDirty

  const save = useCallback(async (): Promise<boolean> => {
    setSaveError(null)
    const r = await entries.save()
    if (r.ok === true) return true
    setSaveError(r.message)
    return false
  }, [entries])

  const saveFiltered = useCallback(async (): Promise<boolean> => {
    if (filteredSaving) return false
    if (filteredRows.length === 0) return false
    setFilteredSaving(true)
    setFilteredError(null)
    try {
      const snapshots = filteredRows.map((r) => ({
        kind: r.kind,
        id: r.id,
        expected_updated_at: r.updated_at,
      }))
      const plan = diffBuffer(filteredRows, filteredBuffer)
      const knownIdsToSend = plan ? plan.knownIds : snapshots
      const bufferToSend = plan ? plan.bufferToSend : filteredBuffer
      const resp = await ledgerClient.replaceBuffer(knownIdsToSend, bufferToSend)
      if (isReplaceBufferError(resp)) {
        if (resp.error === 'occ_conflict') {
          await entries.refetch().catch(() => {})
          setFilteredError(
            'Journal changed elsewhere. Reloaded the latest version.',
          )
          return false
        }
        setFilteredError(resp.message)
        return false
      }
      // Server returns the new global rows. Refresh the unfiltered hook;
      // the filtered-view effect will rebuild filteredRows from entries.rows.
      await entries.refetch().catch(() => {})
      return true
    } catch (e) {
      setFilteredError(e instanceof Error ? e.message : 'Save failed')
      return false
    } finally {
      setFilteredSaving(false)
    }
  }, [filteredSaving, filteredRows, filteredBuffer, entries])

  const requestTab = useCallback(
    (next: Tab) => {
      if (next === tab) return
      if (next === 'journal' && chatBusy) return
      const dirtySomewhere = isDirty || filteredDirty
      if (dirtySomewhere) setPendingTab(next)
      else setTab(next)
    },
    [tab, isDirty, filteredDirty, chatBusy],
  )

  const confirmDiscard = useCallback(() => {
    if (pendingTab === null) return
    entries.setBuffer(entries.baseline)
    setFilteredBuffer(filteredBaseline)
    setSaveError(null)
    setFilteredError(null)
    setTab(pendingTab)
    setPendingTab(null)
  }, [pendingTab, entries, filteredBaseline])

  const confirmSaveAndSwitch = useCallback(async () => {
    if (pendingTab === null) return
    let ok = true
    if (isDirty) ok = (await save()) && ok
    if (ok && filteredDirty) ok = (await saveFiltered()) && ok
    if (!ok) return
    setTab(pendingTab)
    setPendingTab(null)
  }, [pendingTab, isDirty, filteredDirty, save, saveFiltered])

  useEffect(() => {
    if (!isDirty && !filteredDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty, filteredDirty])

  const filteredEditable = filteredRows.length > 0 && filteredCursor === null

  return (
    <>
      <header className="flex items-center justify-between gap-3 border-b border-slate-200/60 px-4 py-3 sm:px-6">
        <div className="w-[60px] sm:w-[120px]" />
        <SegmentedTabs
          value={tab}
          onChange={requestTab}
          lockJournal={chatBusy}
        />
        <div className="flex w-[60px] items-center justify-end gap-2 sm:w-[120px]">
          {tab === 'journal' && entries.loaded && !filterActive ? (
            <>
              <SavedChip dirty={isDirty} saving={entries.saving} />
              <button
                type="button"
                onClick={() => void save()}
                disabled={!isDirty || entries.saving}
                className="rounded-full bg-slate-900 px-3 py-1 text-[12px] font-medium text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
              >
                Save
              </button>
            </>
          ) : null}
          {tab === 'journal' && filterActive && filteredEditable ? (
            <>
              <SavedChip dirty={filteredDirty} saving={filteredSaving} />
              <button
                type="button"
                onClick={() => void saveFiltered()}
                disabled={!filteredDirty || filteredSaving}
                className="rounded-full bg-slate-900 px-3 py-1 text-[12px] font-medium text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
              >
                Save
              </button>
            </>
          ) : null}
          {tab === 'chat' && chatClear.canClear ? (
            <button
              type="button"
              onClick={chatClear.clear}
              disabled={chatBusy}
              title="Clear conversation"
              aria-label="Clear conversation"
              className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
            >
              <Eraser className="size-3.5" />
            </button>
          ) : null}
        </div>
      </header>
      {tab === 'chat' ? (
        mounted ? (
          <Chat
            onBusyChange={setChatBusy}
            onClearableChange={setChatClear}
            onAppended={() => void entries.refetch()}
          />
        ) : null
      ) : (
        <>
          {entries.loaded ? (
            <JournalFilterBar
              accounts={accounts}
              filter={filter}
              onChange={setFilter}
            />
          ) : null}
          {(saveError || entries.loadError) ? (
            <div className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-[12px] text-rose-700 sm:px-6">
              {saveError || entries.loadError}
            </div>
          ) : null}
          {filteredError ? (
            <div className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-[12px] text-rose-700 sm:px-6">
              {filteredError}
            </div>
          ) : null}
          {!entries.loaded ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
              Loading…
            </div>
          ) : filterActive ? (
            <div className="flex flex-1 flex-col overflow-hidden">
              {filteredLoading && !filteredBuffer ? (
                <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
                  Loading…
                </div>
              ) : (
                <Journal
                  text={filteredBuffer}
                  onChange={filteredEditable ? setFilteredBuffer : () => {}}
                  onSave={filteredEditable ? () => void saveFiltered() : () => {}}
                  readOnly={!filteredEditable || filteredSaving}
                  onMount={(view) => {
                    editorViewRef.current = view
                  }}
                />
              )}
              {filteredCursor ? (
                <div className="border-t border-slate-200/60 px-4 py-2 text-center sm:px-6">
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    disabled={filteredLoading}
                    className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                  >
                    {filteredLoading ? 'Loading…' : 'Load older'}
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <Journal
              text={entries.buffer}
              onChange={entries.setBuffer}
              onSave={() => void save()}
              readOnly={entries.saving}
              onMount={(view) => {
                editorViewRef.current = view
              }}
            />
          )}
        </>
      )}
      {pendingTab !== null ? (
        <UnsavedModal
          saving={entries.saving || filteredSaving}
          onCancel={() => setPendingTab(null)}
          onDiscard={confirmDiscard}
          onSave={() => void confirmSaveAndSwitch()}
        />
      ) : null}
    </>
  )
}

// Filter the full entry list down to what the JournalFilterBar selected.
// Mirrors src/durable/ledger-do.ts journal_get_filtered semantics on the
// client so we can keep snapshot identity (kind+id+updated_at) for the
// visible slice — the rendered-text endpoint doesn't carry that.
function filterRowsClientSide(
  rows: ReadonlyArray<EntryRow>,
  filter: JournalFilter,
): EntryRow[] {
  const from = filter.date?.from ?? null
  const to = filter.date?.to ?? null
  const account = filter.account ?? null
  return rows.filter((r) => {
    const date = extractDate(r.raw_text)
    if (date) {
      if (from && date < from) return false
      if (to && date > to) return false
    }
    if (account) {
      // Coarse match against the raw text; balance/note/open/document and
      // any txn referencing the account or a child will match. Good enough
      // for the editing slice — server-side validation handles correctness.
      const matchesAccount =
        r.raw_text.includes(account + '\n') ||
        r.raw_text.includes(account + ' ') ||
        r.raw_text.includes(account + ':')
      if (!matchesAccount) return false
    }
    return true
  })
}

function extractDate(rawText: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(rawText)
  return m ? m[1]! : null
}

function UnsavedModal({
  saving,
  onCancel,
  onDiscard,
  onSave,
}: {
  saving: boolean
  onCancel: () => void
  onDiscard: () => void
  onSave: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[15px] font-semibold text-slate-900">
          Unsaved changes
        </h2>
        <p className="mt-1.5 text-[13px] leading-5 text-slate-600">
          You have unsaved journal edits. Save them before leaving, or discard
          to lose your changes.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-3.5 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="rounded-full border border-slate-200 px-3.5 py-1.5 text-[13px] font-medium text-rose-700 hover:bg-rose-50"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-full bg-slate-900 px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-slate-800 disabled:bg-slate-300"
          >
            {saving ? 'Saving…' : 'Save & switch'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SavedChip({ dirty, saving }: { dirty: boolean; saving: boolean }) {
  const label = saving ? 'Saving…' : dirty ? 'Unsaved' : 'Saved'
  const cls = saving
    ? 'bg-slate-100 text-slate-500'
    : dirty
      ? 'bg-amber-100 text-amber-800'
      : 'bg-emerald-100 text-emerald-800'
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {label}
    </span>
  )
}

function SegmentedTabs({
  value,
  onChange,
  lockJournal,
}: {
  value: Tab
  onChange: (t: Tab) => void
  lockJournal?: boolean
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 p-0.5">
      {(['chat', 'journal'] as const).map((t) => {
        const active = value === t
        const disabled = t === 'journal' && lockJournal && !active
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            disabled={disabled}
            title={disabled ? 'Resolve pending AI changes first' : undefined}
            aria-disabled={disabled || undefined}
            className={[
              'relative rounded-full px-3.5 py-1 text-[13px] font-medium transition',
              active
                ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                : disabled
                  ? 'cursor-not-allowed text-slate-300'
                  : 'text-slate-600 hover:text-slate-900',
            ].join(' ')}
          >
            {t === 'chat' ? 'Chat' : 'Journal'}
            {disabled ? (
              <span
                aria-hidden
                className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-amber-500"
              />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

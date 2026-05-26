'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ListTree } from 'lucide-react'
import type { EditorView } from '@codemirror/view'
import { Chat } from './chat'
import { Journal } from './journal'
import { AccountSheet } from './account-sheet'
import { ledgerClient, isJournalPutError } from '@/lib/ledger-client-browser'

type Tab = 'chat' | 'journal'

export function EditorShell() {
  const [tab, setTab] = useState<Tab>('chat')
  const [pendingTab, setPendingTab] = useState<Tab | null>(null)

  const [text, setText] = useState('')
  const [savedText, setSavedText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [accountsOpen, setAccountsOpen] = useState(false)
  const [chatBusy, setChatBusy] = useState(false)
  const editorViewRef = useRef<EditorView | null>(null)

  const isDirty = loaded && text !== savedText

  useEffect(() => {
    let alive = true
    ledgerClient
      .getJournal()
      .then((r) => {
        if (!alive) return
        setText(r.text)
        setSavedText(r.text)
        setLoaded(true)
      })
      .catch((e) => {
        if (!alive) return
        setSaveError(e instanceof Error ? e.message : 'Failed to load journal')
        setLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [])

  const textRef = useRef(text)
  useEffect(() => {
    textRef.current = text
  }, [text])

  const save = useCallback(async (): Promise<boolean> => {
    if (saving) return false
    setSaving(true)
    setSaveError(null)
    const snapshot = textRef.current
    try {
      const r = await ledgerClient.putJournal(snapshot)
      if (isJournalPutError(r)) {
        setSaveError(r.message)
        return false
      }
      setSavedText(r.text)
      if (r.text !== snapshot) setText(r.text)
      return true
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
      return false
    } finally {
      setSaving(false)
    }
  }, [saving])

  const requestTab = useCallback(
    (next: Tab) => {
      if (next === tab) return
      if (next === 'journal' && chatBusy) return
      if (isDirty) setPendingTab(next)
      else setTab(next)
    },
    [tab, isDirty, chatBusy],
  )

  const confirmDiscard = useCallback(() => {
    if (pendingTab === null) return
    setText(savedText)
    setSaveError(null)
    setTab(pendingTab)
    setPendingTab(null)
  }, [pendingTab, savedText])

  const confirmSaveAndSwitch = useCallback(async () => {
    if (pendingTab === null) return
    const ok = await save()
    if (!ok) return
    setTab(pendingTab)
    setPendingTab(null)
  }, [pendingTab, save])

  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  const scrollToAccount = useCallback((account: string) => {
    const view = editorViewRef.current
    if (!view) return
    const doc = view.state.doc
    const idx = doc.toString().indexOf(account)
    if (idx < 0) return
    const line = doc.lineAt(idx)
    view.dispatch({
      selection: { anchor: line.from },
      scrollIntoView: true,
    })
    setAccountsOpen(false)
    view.focus()
  }, [])

  return (
    <>
      <header className="flex items-center justify-between gap-3 border-b border-slate-200/60 px-4 py-3 sm:px-6">
        <div className="flex w-[120px] items-center gap-2">
          {tab === 'journal' && loaded ? (
            <button
              type="button"
              onClick={() => setAccountsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <ListTree className="size-4" />
              Accounts
            </button>
          ) : null}
        </div>
        <SegmentedTabs
          value={tab}
          onChange={requestTab}
          lockJournal={chatBusy}
        />
        <div className="flex w-[120px] items-center justify-end gap-2">
          {tab === 'journal' && loaded ? (
            <>
              <SavedChip dirty={isDirty} saving={saving} />
              <button
                type="button"
                onClick={() => void save()}
                disabled={!isDirty || saving}
                className="rounded-full bg-slate-900 px-3 py-1 text-[12px] font-medium text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
              >
                Save
              </button>
            </>
          ) : null}
        </div>
      </header>
      {tab === 'chat' ? (
        <Chat onBusyChange={setChatBusy} />
      ) : (
        <>
          {saveError ? (
            <div className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-[12px] text-rose-700 sm:px-6">
              {saveError}
            </div>
          ) : null}
          {loaded ? (
            <Journal
              text={text}
              onChange={setText}
              onSave={() => void save()}
              readOnly={saving}
              onMount={(view) => {
                editorViewRef.current = view
              }}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
              Loading…
            </div>
          )}
        </>
      )}
      {accountsOpen ? (
        <AccountSheet
          text={text}
          onSelect={scrollToAccount}
          onClose={() => setAccountsOpen(false)}
        />
      ) : null}
      {pendingTab !== null ? (
        <UnsavedModal
          saving={saving}
          onCancel={() => setPendingTab(null)}
          onDiscard={confirmDiscard}
          onSave={() => void confirmSaveAndSwitch()}
        />
      ) : null}
    </>
  )
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

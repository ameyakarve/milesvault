import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { Journal } from './journal'
import { AccountSheet } from './account-sheet'

const SAMPLE = `; -*- mode: org -*-

2025-01-01 open Assets:Cash INR
2025-01-01 open Expenses:Food INR
2025-01-01 open Expenses:Rent INR

2025-03-01 * "Landlord" "March rent"
  Expenses:Rent           42300.00 INR
  Assets:Cash

2025-03-14 * "Olive" "Dinner with friends"
  Expenses:Food           12800.00 INR
  Assets:Cash
`

function JournalShell({ seed = SAMPLE, dirty = false }: { seed?: string; dirty?: boolean }) {
  const initial = dirty ? seed + '\n; pending edit\n' : seed
  const [text, setText] = useState(initial)
  const [savedText, setSavedText] = useState(seed)
  const [saving, setSaving] = useState(false)
  const isDirty = text !== savedText

  async function save() {
    setSaving(true)
    await new Promise((r) => setTimeout(r, 400))
    setSavedText(text)
    setSaving(false)
  }

  return (
    <div className="flex h-screen flex-col bg-[#fbfbfa]">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200/60 px-4 py-3 sm:px-6">
        <div className="w-[120px]" />
        <div className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 p-0.5">
          <button className="rounded-full px-3.5 py-1 text-[13px] font-medium text-slate-600">
            Chat
          </button>
          <button className="rounded-full bg-white px-3.5 py-1 text-[13px] font-medium text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            Journal
          </button>
        </div>
        <div className="flex w-[120px] items-center justify-end gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              saving
                ? 'bg-slate-100 text-slate-500'
                : isDirty
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {saving ? 'Saving…' : isDirty ? 'Unsaved' : 'Saved'}
          </span>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!isDirty || saving}
            className="rounded-full bg-slate-900 px-3 py-1 text-[12px] font-medium text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
          >
            Save
          </button>
        </div>
      </header>
      <Journal text={text} onChange={setText} onSave={save} />
    </div>
  )
}

const meta: Meta<typeof JournalShell> = {
  title: 'Editor/Journal',
  component: JournalShell,
  parameters: { layout: 'fullscreen' },
}
export default meta

export const Clean: StoryObj<typeof JournalShell> = {}
export const Dirty: StoryObj<typeof JournalShell> = { args: { dirty: true } }

function UnsavedDialog() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-[15px] font-semibold text-slate-900">
          Unsaved changes
        </h2>
        <p className="mt-1.5 text-[13px] leading-5 text-slate-600">
          You have unsaved journal edits. Save them before leaving, or discard
          to lose your changes.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className="rounded-full px-3.5 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-100">
            Cancel
          </button>
          <button className="rounded-full border border-slate-200 px-3.5 py-1.5 text-[13px] font-medium text-rose-700 hover:bg-rose-50">
            Discard
          </button>
          <button className="rounded-full bg-slate-900 px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-slate-800">
            Save &amp; switch
          </button>
        </div>
      </div>
    </div>
  )
}

function LockedTabsHeader() {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-slate-200/60 bg-[#fbfbfa] px-4 py-3 sm:px-6">
      <div className="w-[120px]" />
      <div className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 p-0.5">
        <button className="rounded-full bg-white px-3.5 py-1 text-[13px] font-medium text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          Chat
        </button>
        <button
          disabled
          title="Resolve pending AI changes first"
          className="relative cursor-not-allowed rounded-full px-3.5 py-1 text-[13px] font-medium text-slate-300"
        >
          Journal
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-amber-500"
          />
        </button>
      </div>
      <div className="w-[120px]" />
    </header>
  )
}

export const JournalLocked: StoryObj = {
  render: () => (
    <div className="flex h-screen flex-col bg-[#fbfbfa]">
      <LockedTabsHeader />
      <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
        Chat is busy.
      </div>
    </div>
  ),
}

const RICH_SAMPLE = `2025-01-01 open Assets:Cash INR
2025-01-01 open Assets:Bank:HDFC INR
2025-01-01 open Assets:Bank:ICICI INR
2025-01-01 open Expenses:Food:Groceries INR
2025-01-01 open Expenses:Food:Dining INR
2025-01-01 open Expenses:Rent INR
2025-01-01 open Expenses:Travel:Air INR
2025-01-01 open Expenses:Travel:Hotel INR
2025-01-01 open Income:Salary INR
2025-01-01 open Liabilities:CreditCard:Amex INR
`

export const AccountSheetOnly: StoryObj = {
  render: () => (
    <div className="h-screen bg-[#fbfbfa]">
      <AccountSheet
        text={RICH_SAMPLE}
        onSelect={(a) => console.log('select', a)}
        onClose={() => console.log('close')}
      />
    </div>
  ),
}

export const UnsavedModal: StoryObj<typeof JournalShell> = {
  args: { dirty: true },
  render: (args) => (
    <>
      <JournalShell {...args} />
      <UnsavedDialog />
    </>
  ),
}

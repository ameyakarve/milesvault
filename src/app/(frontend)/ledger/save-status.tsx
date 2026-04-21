import { CircleDot, Save } from 'lucide-react'

export type SaveStatus = 'idle' | 'saving' | 'conflict' | 'error'

export type DescribedSaveStatus = {
  tone: string
  dotColor: string
  label: string
  isError: boolean
  isBusy: boolean
}

export function describeSaveStatus(input: {
  saveStatus: SaveStatus
  dirty: boolean
  errorMsg?: string | null
}): DescribedSaveStatus {
  const { saveStatus, dirty, errorMsg } = input
  const isError = saveStatus === 'error' || saveStatus === 'conflict'
  const isBusy = saveStatus === 'saving'
  const tone = isError
    ? 'bg-red-50 text-red-700'
    : isBusy
      ? 'bg-sky-50 text-sky-700'
      : dirty
        ? 'bg-amber-100 text-amber-800'
        : 'bg-emerald-50 text-emerald-700'
  const dotColor = isError
    ? 'text-red-600'
    : isBusy
      ? 'text-sky-700'
      : dirty
        ? 'text-amber-700'
        : 'text-emerald-700'
  const label =
    saveStatus === 'saving'
      ? 'saving…'
      : saveStatus === 'conflict'
        ? 'conflict'
        : saveStatus === 'error'
          ? (errorMsg ?? 'error')
          : dirty
            ? 'unsaved'
            : 'saved'
  return { tone, dotColor, label, isError, isBusy }
}

export function SavePill({
  saveStatus,
  dirty,
  errorMsg,
}: {
  saveStatus: SaveStatus
  dirty: boolean
  errorMsg?: string | null
}) {
  const { tone, dotColor, label } = describeSaveStatus({ saveStatus, dirty, errorMsg })
  return (
    <div
      className={`h-[24px] px-2 rounded-[4px] flex items-center gap-1.5 font-mono text-[11px] ml-1 ${tone}`}
      aria-live="polite"
      title={errorMsg ?? undefined}
    >
      <CircleDot size={12} strokeWidth={2} className={dotColor} />
      <span className="truncate max-w-[240px]">{label}</span>
    </div>
  )
}

export function SaveButton({
  saveStatus,
  onSave,
}: {
  saveStatus: SaveStatus
  onSave: () => void | Promise<void>
}) {
  const busy = saveStatus === 'saving'
  const label =
    saveStatus === 'saving'
      ? 'saving…'
      : saveStatus === 'conflict'
        ? 'conflict — reload & retry'
        : saveStatus === 'error'
          ? 'save failed — retry'
          : 'save staged changes'
  const isErr = saveStatus === 'conflict' || saveStatus === 'error'
  const tone = isErr
    ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
    : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        void onSave()
      }}
      className={`max-w-[85%] mt-1 px-2.5 h-[28px] flex items-center gap-2 border ${tone} font-mono text-[11px] uppercase tracking-[0.08em] transition-colors disabled:opacity-60 disabled:cursor-not-allowed`}
    >
      <Save size={12} strokeWidth={1.75} />
      <span>{label}</span>
    </button>
  )
}

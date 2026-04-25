'use client'

import { ArrowUp, MoreHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export type ChatMessage = { id: string; role: string; parts: MessagePart[] }
export type MessagePart =
  | { type: 'text'; text: string }
  | {
      type: `tool-${string}`
      toolCallId: string
      state: string
      input?: unknown
      output?: unknown
    }
  | { type: string }

type ToolPart = Extract<MessagePart, { type: `tool-${string}` }>

const PANE_ROOT_CLS =
  'hidden md:flex w-[360px] shrink-0 border-l border-slate-200 bg-[#F4F6F8] flex-col'

export type AiPaneViewProps = {
  messages: ChatMessage[]
  status: string
  busy: boolean
  saving: boolean
  chatLocked: boolean
  errorMessage: string | null
  onSubmit: (text: string) => void
  onClear: () => void
}

export function AiPaneView({
  messages,
  status,
  busy,
  saving,
  chatLocked,
  errorMessage,
  onSubmit,
  onClear,
}: AiPaneViewProps) {
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [draft])

  const scrollRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, busy])

  const submit = (e: React.FormEvent | React.KeyboardEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || chatLocked) return
    onSubmit(text)
    setDraft('')
  }

  return (
    <aside className={PANE_ROOT_CLS}>
      <div className="flex items-center justify-between h-[36px] px-4 mt-3 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2">
          <span
            className={`w-[6px] h-[6px] rounded-full bg-teal-500 ${busy ? 'animate-pulse' : ''}`}
          />
          <span className="font-sans text-[11px] uppercase tracking-wider font-bold text-slate-500">
            AI
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={saving || messages.length === 0}
            onClick={onClear}
            className="h-[24px] px-2 font-sans text-[10px] uppercase tracking-wider font-bold text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-[4px] transition-colors disabled:opacity-40 disabled:cursor-default"
          >
            Clear
          </button>
          <button
            type="button"
            aria-disabled
            className="h-[24px] w-[24px] flex items-center justify-center text-slate-400 hover:bg-slate-100 rounded-[4px]"
          >
            <MoreHorizontal className="w-[14px] h-[14px]" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="mx-3 mt-3 px-3 py-2 border border-red-200 bg-red-50 rounded-[4px] font-sans text-[11px] text-red-700 shrink-0">
          {errorMessage}
        </div>
      ) : null}

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-4 flex flex-col gap-3">
        {messages.length === 0 ? (
          <div className="font-sans text-[12px] text-slate-400 leading-relaxed px-1">
            Ask about your ledger, or describe a transaction to stage…
          </div>
        ) : (
          messages.map((m) => <Turn key={m.id} message={m} />)
        )}
        {busy ? <BusyIndicator label={status} /> : null}
      </div>

      <form onSubmit={submit} className="px-3 pb-3 pt-2 border-t border-slate-100 shrink-0">
        <div className="bg-white border border-slate-200 rounded-[6px] flex items-end px-3 py-1.5 focus-within:border-[#0891B2] transition-colors gap-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit(e)
              }
            }}
            disabled={chatLocked}
            rows={1}
            placeholder={saving ? 'saving…' : 'Ask, or describe a transaction…'}
            className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none font-sans text-[12px] text-navy-900 placeholder:text-slate-400 disabled:opacity-50 resize-none py-[6px] max-h-[160px] overflow-y-auto leading-relaxed"
          />
          <button
            type="submit"
            disabled={!draft.trim() || chatLocked}
            aria-label="Send"
            className="w-[26px] h-[26px] bg-[#0891B2] text-white flex items-center justify-center rounded-[4px] hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-default shrink-0 mb-[2px]"
          >
            <ArrowUp className="w-[14px] h-[14px]" strokeWidth={2} />
          </button>
        </div>
      </form>
    </aside>
  )
}

function Turn({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const visible = message.parts.filter(isVisiblePart)
  if (visible.length === 0) return null
  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`px-3 py-2 max-w-[85%] rounded-[6px] ${
          isUser
            ? 'bg-[#0891B2] text-white'
            : 'bg-white border border-slate-200 text-navy-900'
        }`}
      >
        {visible.map((part, i) => (
          <PartView key={i} part={part} />
        ))}
      </div>
    </div>
  )
}

function isVisiblePart(part: MessagePart): boolean {
  if (part.type === 'text') return Boolean((part as { text: string }).text)
  if (part.type === 'tool-reply' || part.type === 'tool-propose') {
    const tp = part as ToolPart
    return Boolean((tp.input as { message?: string } | undefined)?.message)
  }
  return false
}

function PartView({ part }: { part: MessagePart }) {
  if (part.type === 'text') {
    const text = (part as { text: string }).text
    if (!text) return null
    return (
      <div className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed">
        {text}
      </div>
    )
  }
  if (part.type === 'tool-reply' || part.type === 'tool-propose') {
    const tp = part as ToolPart
    const message = (tp.input as { message?: string } | undefined)?.message
    if (!message) return null
    return (
      <div className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed">
        {message}
      </div>
    )
  }
  return null
}

function BusyIndicator({ label }: { label: string }) {
  const text = label === 'submitted' ? 'thinking' : 'working'
  return (
    <div className="flex items-start">
      <div className="px-3 py-2 bg-white border border-slate-200 rounded-[6px] flex items-center gap-2">
        <span className="flex gap-1" aria-hidden>
          <span className="w-1 h-1 rounded-full bg-slate-400 animate-pulse [animation-delay:0ms]" />
          <span className="w-1 h-1 rounded-full bg-slate-400 animate-pulse [animation-delay:150ms]" />
          <span className="w-1 h-1 rounded-full bg-slate-400 animate-pulse [animation-delay:300ms]" />
        </span>
        <span className="font-sans text-[10px] uppercase tracking-wider font-bold text-slate-500">
          {text}…
        </span>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { useAgent } from 'agents/react'
import { useAgentChat } from '@cloudflare/ai-chat/react'
import { ArrowUp } from '@phosphor-icons/react'

type Part = { type: string; text?: string; [k: string]: unknown }

export function Chat() {
  const agent = useAgent({ agent: 'LedgerDO', basePath: 'api/agents' })
  const { messages, sendMessage, status, error } = useAgentChat({ agent })
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const busy = status === 'submitted' || status === 'streaming'
  const empty = messages.length === 0

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages.length, status])

  function submit() {
    if (busy) return
    const text = input.trim()
    if (!text) return
    setInput('')
    void sendMessage({ text })
  }

  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-8">
        {empty ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Start a conversation.
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            {messages.map((m) => (
              <MessageRow key={m.id} role={m.role} parts={m.parts} />
            ))}
            {status === 'submitted' && (
              <div className="text-xs text-slate-400">Thinking…</div>
            )}
            {error && (
              <div className="rounded-[8px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {error.message}
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="border-t border-slate-200 px-6 py-4">
        <div className="mx-auto flex w-full max-w-3xl items-end gap-3 rounded-[12px] border border-slate-200 bg-white px-4 py-3 focus-within:border-teal-500">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            rows={2}
            placeholder="Message the agent…"
            className="flex-1 resize-none bg-transparent text-sm leading-6 text-slate-900 placeholder:text-slate-400 outline-none"
          />
          <button
            type="button"
            onClick={submit}
            disabled={busy || !input.trim()}
            className="shrink-0 rounded-[8px] bg-teal-500 p-2 text-white transition disabled:opacity-40"
            aria-label="Send"
          >
            <ArrowUp size={18} weight="bold" />
          </button>
        </div>
      </footer>
    </section>
  )
}

function MessageRow({ role, parts }: { role: string; parts: unknown }) {
  const list = Array.isArray(parts) ? (parts as Part[]) : []
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-[12px] px-4 py-3 text-sm leading-6 ${
          isUser ? 'bg-teal-500 text-white' : 'bg-slate-50 text-slate-900'
        }`}
      >
        {list.map((p, i) => {
          if (p.type === 'text' && typeof p.text === 'string') {
            return (
              <div key={i} className="whitespace-pre-wrap">
                {p.text}
              </div>
            )
          }
          return null
        })}
      </div>
    </div>
  )
}

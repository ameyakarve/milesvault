'use client'

import { useEffect, useRef, useState } from 'react'
import { useAgent } from 'agents/react'
import { useAgentChat } from '@cloudflare/ai-chat/react'
import { ArrowUp, Sparkle } from '@phosphor-icons/react'

type Part = { type: string; text?: string; [k: string]: unknown }

export function Chat() {
  const agent = useAgent({ agent: 'LedgerDO', basePath: 'api/agents' })
  const { messages, sendMessage, status, error } = useAgentChat({ agent })
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const busy = status === 'submitted' || status === 'streaming'
  const empty = messages.length === 0

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages.length, status])

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`
  }, [input])

  function submit() {
    if (busy) return
    const text = input.trim()
    if (!text) return
    setInput('')
    void sendMessage({ text })
  }

  return (
    <section className="flex flex-1 flex-col overflow-hidden bg-white">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 pt-10 pb-6">
          {empty ? (
            <div className="flex min-h-[60vh] items-center justify-center">
              <h1 className="text-[28px] font-medium tracking-tight text-gray-800">
                How can I help?
              </h1>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {messages.map((m) => (
                <MessageRow key={m.id} role={m.role} parts={m.parts} />
              ))}
              {status === 'submitted' && <ThinkingDots />}
              {error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error.message}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="mx-auto w-full max-w-3xl">
          <div className="relative rounded-[28px] border border-black/10 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.05)] transition focus-within:border-black/20">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              rows={1}
              placeholder="Message the agent…"
              className="block w-full resize-none bg-transparent px-5 pt-4 pb-14 text-[15px] leading-6 text-gray-900 outline-none placeholder:text-gray-500"
            />
            <button
              type="button"
              onClick={submit}
              disabled={busy || !input.trim()}
              className="absolute bottom-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-black text-white transition disabled:bg-[#d7d7d7] disabled:text-white"
              aria-label="Send"
            >
              <ArrowUp size={18} weight="bold" />
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-gray-500">
            Answers may be inaccurate. Verify important information.
          </p>
        </div>
      </div>
    </section>
  )
}

function MessageRow({ role, parts }: { role: string; parts: unknown }) {
  const list = Array.isArray(parts) ? (parts as Part[]) : []
  const isUser = role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] whitespace-pre-wrap rounded-3xl bg-[#f4f4f4] px-5 py-2.5 text-[15px] leading-6 text-gray-900">
          {list.map((p, i) =>
            p.type === 'text' && typeof p.text === 'string' ? (
              <span key={i}>{p.text}</span>
            ) : null,
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-4">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white">
        <Sparkle size={14} weight="regular" className="text-gray-700" />
      </div>
      <div className="flex-1 text-[15px] leading-7 text-gray-900">
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

function ThinkingDots() {
  return (
    <div className="flex gap-4">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white">
        <Sparkle size={14} weight="regular" className="text-gray-700" />
      </div>
      <div className="flex items-center pt-1.5">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-gray-800" />
      </div>
    </div>
  )
}

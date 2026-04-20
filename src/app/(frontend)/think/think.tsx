'use client'

import { useAgent } from 'agents/react'
import { useAgentChat } from '@cloudflare/ai-chat/react'
import { useEffect, useState } from 'react'

export function ThinkPlayground({ email }: { email: string }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) {
    return <div className="min-h-screen bg-[#F4F4F5]" />
  }
  return <ThinkPlaygroundInner email={email} />
}

function ThinkPlaygroundInner({ email }: { email: string }) {
  const agent = useAgent({
    agent: 'think-agent',
    name: email,
    query: async () => {
      const res = await fetch(new URL('/api/think/session', window.location.origin), {
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`token ${res.status}`)
      const { token } = (await res.json()) as { token: string }
      return { token }
    },
    cacheTtl: 4 * 60 * 1000,
  })

  const { messages, sendMessage, status, clearHistory, error } = useAgentChat({ agent })
  const [draft, setDraft] = useState('')
  const busy = status === 'streaming' || status === 'submitted'

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    sendMessage({ text })
    setDraft('')
  }

  return (
    <main className="min-h-screen bg-[#F4F4F5] flex flex-col">
      <header className="h-12 px-6 flex items-center justify-between border-b border-zinc-200">
        <h2 className="font-sans text-[13px] font-medium text-[#09090B]">Think · playground</h2>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.08em]">
            {status}
          </span>
          <button
            type="button"
            onClick={() => clearHistory()}
            className="font-mono text-[10px] text-zinc-500 hover:text-[#09090B] uppercase tracking-[0.08em]"
          >
            clear
          </button>
        </div>
      </header>

      {error ? (
        <div className="mx-6 mt-4 rounded border border-red-200 bg-red-50 p-2 font-mono text-[11px] text-red-700">
          {error.message}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-5 pb-24 max-w-3xl w-full mx-auto">
        {messages.length === 0 ? (
          <p className="font-mono text-[13px] text-zinc-500">
            ask about your ledger — read-only (search/get only)
          </p>
        ) : (
          messages.map((m) => <ThinkTurn key={m.id} message={m as ThinkMessage} />)
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="sticky bottom-0 px-6 py-4 bg-[#F4F4F5] border-t border-zinc-200"
      >
        <div className="flex items-center gap-3 max-w-3xl mx-auto">
          <span className="text-zinc-600 font-mono text-[13px]">›</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy}
            type="text"
            placeholder="ask about your ledger…"
            className="flex-1 bg-transparent border-none focus:ring-0 font-mono text-[13px] text-[#09090B] placeholder-zinc-400 px-0 py-1 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!draft.trim() || busy}
            className="font-mono text-[10px] text-zinc-500 shrink-0 tracking-[0.08em] uppercase disabled:text-zinc-300"
          >
            ⏎ send
          </button>
        </div>
      </form>
    </main>
  )
}

type ThinkMessage = { id: string; role: string; parts: MessagePart[] }
type MessagePart =
  | { type: 'text'; text: string }
  | {
      type: `tool-${string}`
      toolCallId: string
      state: string
      input?: unknown
      output?: unknown
    }
  | { type: string }

function ThinkTurn({ message }: { message: ThinkMessage }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.08em]">
        {message.role}
      </div>
      <div className={message.role === 'user' ? 'text-[#09090B]' : 'text-zinc-700'}>
        {message.parts.map((part, i) => (
          <PartView key={i} part={part} />
        ))}
      </div>
    </div>
  )
}

function PartView({ part }: { part: MessagePart }) {
  if (part.type === 'text') {
    return (
      <div className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed">
        {(part as { text: string }).text}
      </div>
    )
  }
  if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
    const tp = part as Extract<MessagePart, { type: `tool-${string}` }>
    const toolName = tp.type.replace(/^tool-/, '')
    return (
      <pre className="my-2 overflow-x-auto rounded border border-zinc-200 bg-white p-2 font-mono text-[11px] text-zinc-700">
        <div className="text-zinc-500">→ {toolName}</div>
        {tp.input !== undefined ? JSON.stringify(tp.input, null, 2) : null}
        {tp.output !== undefined ? (
          <div className="mt-1 border-t border-zinc-100 pt-1 text-zinc-600">
            {JSON.stringify(tp.output, null, 2)}
          </div>
        ) : null}
      </pre>
    )
  }
  return null
}

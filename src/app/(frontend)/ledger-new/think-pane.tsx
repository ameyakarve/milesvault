'use client'

import { useAgent } from 'agents/react'
import { useAgentChat } from '@cloudflare/ai-chat/react'
import { ArrowUp, Mic, Paperclip } from 'lucide-react'
import { useEffect, useState } from 'react'

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

export function ThinkPane({ email }: { email: string }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) {
    return <div className="flex-1 bg-white flex flex-col overflow-hidden" />
  }
  return <ThinkPaneInner email={email} />
}

function ThinkPaneInner({ email }: { email: string }) {
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
    <div className="flex-1 bg-white flex flex-col overflow-hidden">
      <div className="h-[28px] px-3 flex items-center justify-between border-b border-slate-200 bg-white shrink-0 gap-2">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-navy-700">
          ASSISTANT
        </h2>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-slate-500 uppercase tracking-[0.08em]">
            {status}
          </span>
          <button
            type="button"
            onClick={() => clearHistory()}
            className="font-mono text-[10px] text-slate-500 hover:text-navy-700 uppercase tracking-[0.08em]"
          >
            clear
          </button>
        </div>
      </div>

      {error ? (
        <div className="mx-3 mt-3 px-2 py-1.5 border border-red-200 bg-red-50 font-mono text-[11px] text-red-700">
          {error.message}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 text-[11px] font-mono">
        {messages.length === 0 ? (
          <div className="text-slate-400">ask about your ledger…</div>
        ) : (
          messages.map((m) => <Turn key={m.id} message={m as ThinkMessage} />)
        )}
      </div>

      <form onSubmit={onSubmit} className="p-2 border-t border-slate-200 shrink-0 bg-white mt-auto">
        <div className="bg-white flex items-center px-2 h-[36px] border border-slate-200 focus-within:border-navy-600 transition-colors">
          <button
            type="button"
            title="attach"
            disabled
            className="w-[24px] h-[24px] flex items-center justify-center text-slate-300 rounded-[2px]"
          >
            <Paperclip size={14} strokeWidth={1.5} />
          </button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy}
            className="bg-transparent border-none focus:ring-0 focus:outline-none text-[11px] font-mono w-full text-navy-600 placeholder:text-slate-400 disabled:opacity-50"
            placeholder="ask about your ledger…"
            type="text"
          />
          <button
            type="button"
            title="dictate"
            disabled
            className="w-[24px] h-[24px] flex items-center justify-center text-slate-300 rounded-[2px]"
          >
            <Mic size={14} strokeWidth={1.5} />
          </button>
          <button
            type="submit"
            disabled={!draft.trim() || busy}
            title="send"
            className="bg-navy-600 text-white w-[24px] h-[24px] flex items-center justify-center hover:bg-navy-700 transition-colors shrink-0 ml-1 rounded-[2px] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowUp size={14} strokeWidth={1.5} />
          </button>
        </div>
      </form>
    </div>
  )
}

function Turn({ message }: { message: ThinkMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`px-3 py-2 max-w-[85%] border border-slate-200 ${
          isUser
            ? 'bg-amber-50/50 text-navy-600 border-l-[2px] border-l-amber-500'
            : 'bg-emerald-50 text-navy-600 border-l-[2px] border-l-emerald-500'
        }`}
      >
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
      <div className="whitespace-pre-wrap text-[11px] leading-relaxed">
        {(part as { text: string }).text}
      </div>
    )
  }
  if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
    const tp = part as Extract<MessagePart, { type: `tool-${string}` }>
    const toolName = tp.type.replace(/^tool-/, '')
    return (
      <pre className="mt-1 first:mt-0 overflow-x-auto text-[10px] text-slate-600 leading-snug whitespace-pre-wrap">
        <span className="text-slate-400">→ {toolName}</span>
        {tp.input !== undefined ? `\n${JSON.stringify(tp.input)}` : ''}
        {tp.output !== undefined ? `\n← ${JSON.stringify(tp.output)}` : ''}
      </pre>
    )
  }
  return null
}

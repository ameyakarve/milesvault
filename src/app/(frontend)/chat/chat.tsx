'use client'

import { useAgent } from 'agents/react'
import { useAgentChat } from '@cloudflare/ai-chat/react'
import { useState } from 'react'

export function Chat({ email }: { email: string }) {
  const agent = useAgent({
    agent: 'chat-agent',
    name: email,
    query: async () => {
      const res = await fetch('/api/chat/session', { credentials: 'include' })
      if (!res.ok) throw new Error('failed to fetch chat session token')
      const { token } = (await res.json()) as { token: string }
      return { token }
    },
    cacheTtl: 4 * 60 * 1000,
  })

  const { messages, sendMessage, status, clearHistory } = useAgentChat({ agent })
  const [draft, setDraft] = useState('')

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    sendMessage({ text })
    setDraft('')
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-6">
      <header className="flex items-center justify-between border-b border-slate-200 pb-3">
        <h1 className="font-serif text-xl">Ledger Chat</h1>
        <button
          type="button"
          onClick={() => clearHistory()}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
        >
          Clear
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto py-4">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-500">
            Ask me to search or edit your beancount ledger.
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={m.role === 'user' ? 'text-slate-900' : 'text-slate-700'}
            >
              <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">
                {m.role}
              </div>
              <div className="space-y-2">
                {m.parts.map((part, i) => {
                  if (part.type === 'text') {
                    return (
                      <div key={i} className="whitespace-pre-wrap font-sans text-sm">
                        {part.text}
                      </div>
                    )
                  }
                  if (part.type.startsWith('tool-')) {
                    const toolName = part.type.replace(/^tool-/, '')
                    return (
                      <pre
                        key={i}
                        className="overflow-x-auto rounded bg-slate-100 p-2 font-mono text-xs text-slate-700"
                      >
                        <div className="text-slate-500">→ {toolName}</div>
                        {'input' in part ? JSON.stringify(part.input, null, 2) : null}
                        {'output' in part ? (
                          <div className="mt-1 border-t border-slate-200 pt-1 text-slate-600">
                            {JSON.stringify(part.output, null, 2)}
                          </div>
                        ) : null}
                      </pre>
                    )
                  }
                  return null
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2 border-t border-slate-200 pt-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={status === 'streaming' || status === 'submitted'}
          placeholder="Find my Swiggy orders this month..."
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!draft.trim() || status === 'streaming' || status === 'submitted'}
          className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:bg-slate-400"
        >
          Send
        </button>
      </form>
    </div>
  )
}

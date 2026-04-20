'use client'

import { useAgent } from 'agents/react'
import { useAgentChat } from '@cloudflare/ai-chat/react'
import { useEffect, useState } from 'react'

type ToolResultFn = (args: {
  tool: string
  toolCallId: string
  output: unknown
}) => void | Promise<void>

export function LedgerAssistant({ email, onMutate }: { email: string; onMutate?: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) {
    return (
      <aside className="w-1/2 h-full bg-[#F4F4F5] border-l border-zinc-200 flex flex-col relative" />
    )
  }
  return <LedgerAssistantInner email={email} onMutate={onMutate} />
}

function LedgerAssistantInner({ email, onMutate }: { email: string; onMutate?: () => void }) {
  const agent = useAgent({
    agent: 'chat-agent',
    name: email,
    query: async () => {
      const res = await fetch(new URL('/api/chat/session', window.location.origin), {
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`token ${res.status}`)
      const { token } = (await res.json()) as { token: string }
      return { token }
    },
    cacheTtl: 4 * 60 * 1000,
  })

  const { messages, sendMessage, status, clearHistory, error, addToolResult } = useAgentChat({
    agent,
  })
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
    <aside className="w-1/2 h-full bg-[#F4F4F5] border-l border-zinc-200 flex flex-col relative">
      <header className="h-12 px-6 flex items-center justify-between border-b border-zinc-200">
        <h2 className="font-sans text-[13px] font-medium text-[#09090B]">Assistant</h2>
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

      <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-5 pb-24">
        {messages.length === 0 ? (
          <p className="font-mono text-[13px] text-zinc-500">
            ask about your ledger, or draft a new transaction…
          </p>
        ) : (
          messages.map((m) => (
            <ChatTurn
              key={m.id}
              message={m as ChatMessage}
              addToolResult={addToolResult as ToolResultFn}
              onMutate={onMutate}
            />
          ))
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="absolute bottom-0 left-0 right-0 px-6 py-4 bg-[#F4F4F5] border-t border-zinc-200"
      >
        <div className="flex items-center gap-3">
          <span className="text-zinc-600 font-mono text-[13px]">›</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy}
            type="text"
            placeholder="ask, or draft a new transaction…"
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
    </aside>
  )
}

type ChatMessage = { id: string; role: string; parts: MessagePart[] }

type MessagePart =
  | { type: 'text'; text: string }
  | {
      type: `tool-${string}`
      toolCallId: string
      state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error'
      input?: unknown
      output?: unknown
    }
  | { type: string }

function ChatTurn({
  message,
  addToolResult,
  onMutate,
}: {
  message: ChatMessage
  addToolResult: ToolResultFn
  onMutate?: () => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.08em]">
        {message.role}
      </div>
      <div className={message.role === 'user' ? 'text-[#09090B]' : 'text-zinc-700'}>
        {message.parts.map((part, i) => (
          <PartView key={i} part={part} addToolResult={addToolResult} onMutate={onMutate} />
        ))}
      </div>
    </div>
  )
}

function PartView({
  part,
  addToolResult,
  onMutate,
}: {
  part: MessagePart
  addToolResult: ToolResultFn
  onMutate?: () => void
}) {
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

    if (toolName === 'ledger_apply' && tp.state === 'input-available') {
      const input = (tp.input ?? {}) as ApplyInput
      return (
        <ApplyProposalCard
          toolCallId={tp.toolCallId}
          input={input}
          addToolResult={addToolResult}
          onMutate={onMutate}
        />
      )
    }

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

type ResolveState = 'idle' | 'working' | 'done' | 'error'

type ApplyInput = {
  creates?: { raw_text: string }[]
  updates?: { id: number; raw_text: string }[]
  deletes?: { id: number }[]
}

function ApplyProposalCard({
  toolCallId,
  input,
  addToolResult,
  onMutate,
}: {
  toolCallId: string
  input: ApplyInput
  addToolResult: ToolResultFn
  onMutate?: () => void
}) {
  const [state, setState] = useState<ResolveState>('idle')
  const [msg, setMsg] = useState<string | null>(null)
  const disabled = state === 'working' || state === 'done'

  const creates = input.creates ?? []
  const updates = input.updates ?? []
  const deletes = input.deletes ?? []
  const hasDelete = deletes.length > 0
  const totalCount = creates.length + updates.length + deletes.length

  const heading =
    totalCount === 0
      ? 'Empty batch'
      : `Proposed changes: ${[
          creates.length ? `${creates.length} create` : null,
          updates.length ? `${updates.length} update` : null,
          deletes.length ? `${deletes.length} delete` : null,
        ]
          .filter(Boolean)
          .join(', ')}`

  const onApprove = async () => {
    setState('working')
    setMsg(null)
    try {
      const needsTs = [
        ...updates.map((u) => u.id),
        ...deletes.map((d) => d.id),
      ]
      const tsMap = new Map<number, number>()
      for (const id of needsTs) {
        if (tsMap.has(id)) continue
        const r = await fetch(`/api/ledger/transactions/${id}`, { credentials: 'include' })
        if (!r.ok) throw new Error(`lookup #${id}: HTTP ${r.status}`)
        const txn = (await r.json()) as { updated_at: number }
        tsMap.set(id, txn.updated_at)
      }
      const body = {
        creates: creates.map((c) => ({ raw_text: c.raw_text })),
        updates: updates.map((u) => ({
          id: u.id,
          raw_text: u.raw_text,
          expected_updated_at: tsMap.get(u.id)!,
        })),
        deletes: deletes.map((d) => ({
          id: d.id,
          expected_updated_at: tsMap.get(d.id)!,
        })),
      }
      const res = await fetch('/api/ledger/transactions/batch', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const text = await res.text()
      let json: unknown = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        json = null
      }
      if (!res.ok) {
        if (res.status === 409) {
          setState('error')
          setMsg('conflict — someone else edited this')
          await addToolResult({
            tool: 'ledger_apply',
            toolCallId,
            output: { ok: false, conflicts: (json as { conflicts: unknown } | null)?.conflicts },
          })
          return
        }
        const errs = (json as { errors?: unknown } | null)?.errors
        const flat = Array.isArray(errs)
          ? errs.flatMap((e: { errors?: string[] } | string) =>
              typeof e === 'string' ? [e] : (e.errors ?? []),
            )
          : [text || `HTTP ${res.status}`]
        setState('error')
        setMsg(flat.join('; '))
        await addToolResult({
          tool: 'ledger_apply',
          toolCallId,
          output: { ok: false, errors: flat },
        })
        return
      }
      const { updated, created, deleted } = json as {
        updated: unknown[]
        created: unknown[]
        deleted: number[]
      }
      setState('done')
      setMsg(
        `applied: +${created.length} create, ~${updated.length} update, -${deleted.length} delete`,
      )
      onMutate?.()
      await addToolResult({
        tool: 'ledger_apply',
        toolCallId,
        output: { ok: true, created, updated, deleted },
      })
    } catch (e) {
      const errMsg = (e as Error).message
      setState('error')
      setMsg(errMsg)
      await addToolResult({
        tool: 'ledger_apply',
        toolCallId,
        output: { ok: false, errors: [errMsg] },
      })
    }
  }

  const onReject = async () => {
    setState('done')
    setMsg('discarded')
    await addToolResult({
      tool: 'ledger_apply',
      toolCallId,
      output: { ok: false, rejected: true },
    })
  }

  return (
    <ProposalShell
      heading={heading}
      body={
        totalCount === 0 ? null : (
          <div className="flex flex-col gap-3">
            {creates.map((c, i) => (
              <DiffSection key={`c${i}`} label="create">
                <BeancountBlock text={c.raw_text} />
              </DiffSection>
            ))}
            {updates.map((u, i) => (
              <DiffSection key={`u${i}`} label={`update #${u.id}`}>
                <BeancountBlock text={u.raw_text} />
              </DiffSection>
            ))}
            {deletes.map((d, i) => (
              <DiffSection key={`d${i}`} label={`delete #${d.id}`}>
                <span className="font-mono text-[12px] text-zinc-500">remove transaction</span>
              </DiffSection>
            ))}
          </div>
        )
      }
      state={state}
      msg={msg}
      disabled={disabled || totalCount === 0}
      onApprove={onApprove}
      onReject={onReject}
      destructive={hasDelete}
    />
  )
}

function DiffSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.08em] mb-1">
        {label}
      </div>
      {children}
    </div>
  )
}

function ProposalShell({
  heading,
  body,
  state,
  msg,
  disabled,
  onApprove,
  onReject,
  destructive,
}: {
  heading: string
  body: React.ReactNode
  state: ResolveState
  msg: string | null
  disabled: boolean
  onApprove: () => void
  onReject: () => void
  destructive?: boolean
}) {
  return (
    <div className="my-2 rounded border border-zinc-200 bg-white overflow-hidden">
      <div className="px-3 py-2 border-b border-zinc-100 font-mono text-[11px] text-zinc-500 uppercase tracking-[0.08em]">
        {heading}
      </div>
      {body ? <div className="px-3 py-3">{body}</div> : null}
      <div className="px-3 py-2 border-t border-zinc-100 flex items-center justify-between gap-2">
        <span
          className={`font-mono text-[11px] ${
            state === 'error'
              ? 'text-red-600'
              : state === 'done'
                ? 'text-zinc-500'
                : 'text-zinc-400'
          }`}
        >
          {msg ?? (state === 'working' ? 'saving…' : '')}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            title="edit coming soon"
            className="px-2 h-7 font-mono text-[11px] uppercase tracking-[0.08em] text-zinc-300 border border-zinc-200 rounded bg-white cursor-not-allowed"
          >
            edit
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={disabled}
            className="px-2 h-7 font-mono text-[11px] uppercase tracking-[0.08em] text-zinc-600 hover:text-[#09090B] border border-zinc-200 rounded bg-white disabled:text-zinc-300 disabled:cursor-not-allowed"
          >
            reject
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={disabled}
            className={`px-2 h-7 font-mono text-[11px] uppercase tracking-[0.08em] rounded border disabled:opacity-50 disabled:cursor-not-allowed ${
              destructive
                ? 'text-white bg-red-600 border-red-600 hover:bg-red-700'
                : 'text-white bg-[#09090B] border-[#09090B] hover:bg-zinc-800'
            }`}
          >
            {destructive ? 'confirm' : 'approve'}
          </button>
        </div>
      </div>
    </div>
  )
}

function BeancountBlock({ text }: { text: string }) {
  return (
    <pre className="font-mono text-[12px] leading-relaxed text-[#09090B] whitespace-pre-wrap">
      {text}
    </pre>
  )
}

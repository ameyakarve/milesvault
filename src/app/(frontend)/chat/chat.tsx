'use client'

import { useAgent } from 'agents/react'
import { useAgentChat } from '@cloudflare/ai-chat/react'
import { lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai'
import { useEffect, useState } from 'react'

type ApprovalResponseFn = (args: {
  id: string
  approved: boolean
  reason?: string
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

function useAutoReloadOnNewBuild() {
  useEffect(() => {
    const ownId = process.env.NEXT_PUBLIC_BUILD_ID
    if (!ownId) return
    let reloaded = false
    const check = async () => {
      if (reloaded) return
      try {
        const r = await fetch('/api/version', { cache: 'no-store', credentials: 'include' })
        if (!r.ok) return
        const { buildId } = (await r.json()) as { buildId?: string | null }
        if (buildId && buildId !== ownId) {
          reloaded = true
          window.location.reload()
        }
      } catch {
        // network hiccup — try again next tick
      }
    }
    void check()
    const id = setInterval(check, 60_000)
    const onFocus = (): void => {
      void check()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [])
}

function LedgerAssistantInner({ email, onMutate }: { email: string; onMutate?: () => void }) {
  useAutoReloadOnNewBuild()
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

  const { messages, sendMessage, status, clearHistory, error, addToolApprovalResponse } =
    useAgentChat({
      agent,
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
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
              addToolApprovalResponse={addToolApprovalResponse as ApprovalResponseFn}
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
      state:
        | 'input-streaming'
        | 'input-available'
        | 'approval-requested'
        | 'approval-responded'
        | 'output-available'
        | 'output-error'
      input?: unknown
      output?: unknown
      approval?: { id: string; approved?: boolean; reason?: string }
    }
  | { type: string }

function ChatTurn({
  message,
  addToolApprovalResponse,
  onMutate,
}: {
  message: ChatMessage
  addToolApprovalResponse: ApprovalResponseFn
  onMutate?: () => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.08em]">
        {message.role}
      </div>
      <div className={message.role === 'user' ? 'text-[#09090B]' : 'text-zinc-700'}>
        {message.parts.map((part, i) => (
          <PartView
            key={i}
            part={part}
            addToolApprovalResponse={addToolApprovalResponse}
            onMutate={onMutate}
          />
        ))}
      </div>
    </div>
  )
}

function PartView({
  part,
  addToolApprovalResponse,
  onMutate,
}: {
  part: MessagePart
  addToolApprovalResponse: ApprovalResponseFn
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

    if (toolName === 'ledger_apply') {
      const input = (tp.input ?? {}) as ApplyInput
      return (
        <ApplyProposalCard
          state={tp.state}
          approval={tp.approval}
          input={input}
          output={tp.output}
          addToolApprovalResponse={addToolApprovalResponse}
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

type ApplyInput = {
  creates?: { raw_text: string }[]
  updates?: { id: number; raw_text: string }[]
  deletes?: { id: number }[]
}

type ApplyOutput = {
  ok?: boolean
  created?: unknown[]
  updated?: unknown[]
  deleted?: number[]
  errors?: string[]
  conflicts?: unknown[]
}

type ToolPartState =
  | 'input-streaming'
  | 'input-available'
  | 'approval-requested'
  | 'approval-responded'
  | 'output-available'
  | 'output-error'

function ApplyProposalCard({
  state,
  approval,
  input,
  output,
  addToolApprovalResponse,
  onMutate,
}: {
  state: ToolPartState
  approval?: { id: string; approved?: boolean; reason?: string }
  input: ApplyInput
  output?: unknown
  addToolApprovalResponse: ApprovalResponseFn
  onMutate?: () => void
}) {
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

  const isAwaiting = state === 'approval-requested'
  const isWorking = state === 'approval-responded' && approval?.approved === true
  const out = (output ?? {}) as ApplyOutput
  const didApply = state === 'output-available' && out.ok === true
  const didFail = state === 'output-available' && out.ok === false
  const wasRejected =
    (state === 'approval-responded' && approval?.approved === false) ||
    (state === 'output-available' && out.ok === false && !out.errors && !out.conflicts)

  useEffect(() => {
    if (didApply) onMutate?.()
  }, [didApply, onMutate])

  let resolveState: 'idle' | 'working' | 'done' | 'error'
  let msg: string | null = null
  if (isAwaiting) {
    resolveState = 'idle'
  } else if (isWorking) {
    resolveState = 'working'
    msg = 'saving…'
  } else if (didApply) {
    resolveState = 'done'
    msg = `applied: +${out.created?.length ?? 0} create, ~${out.updated?.length ?? 0} update, -${out.deleted?.length ?? 0} delete`
  } else if (wasRejected) {
    resolveState = 'done'
    msg = 'discarded'
  } else if (didFail) {
    resolveState = 'error'
    if (out.conflicts) msg = 'conflict — someone else edited this'
    else msg = (out.errors ?? ['apply failed']).join('; ')
  } else {
    resolveState = 'idle'
  }

  const disabled = !isAwaiting || totalCount === 0

  const onApprove = () => {
    if (!approval) return
    void addToolApprovalResponse({ id: approval.id, approved: true })
  }

  const onReject = () => {
    if (!approval) return
    void addToolApprovalResponse({ id: approval.id, approved: false, reason: 'user rejected' })
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
      state={resolveState}
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

type ResolveState = 'idle' | 'working' | 'done' | 'error'

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

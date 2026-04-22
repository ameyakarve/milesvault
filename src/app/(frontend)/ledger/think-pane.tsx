'use client'

import { useAgent } from 'agents/react'
import { useAgentChat } from '@cloudflare/ai-chat/react'
import { ArrowUp, Mic, Paperclip } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Op, Snapshot } from './propose'
import { createMapReader } from '@/lib/ledger-reader/map'
import { buildEntriesFromBuffer } from '@/lib/ledger-reader/entries'
import { buildClientTools } from './ledger-tools-client'
import { PaneLabel } from './ledger-chrome'

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

type ToolPart = Extract<MessagePart, { type: `tool-${string}` }>

type OnPropose = (ops: readonly Op[]) => { ok: boolean; reason?: string }

type ThinkPaneProps = {
  email: string
  buffer: string
  snapshots: Snapshot[]
  saving?: boolean
  onPropose: OnPropose
  onAiBusyChange?: (busy: boolean) => void
}

export function ThinkPane(props: ThinkPaneProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) {
    return <div className="flex-1 bg-[#CCDBE7] flex flex-col overflow-hidden" />
  }
  return <ThinkPaneInner {...props} />
}

function ThinkPaneInner({
  email,
  buffer,
  snapshots,
  saving = false,
  onPropose,
  onAiBusyChange,
}: ThinkPaneProps) {
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

  const entriesRef = useRef(buildEntriesFromBuffer(buffer, snapshots))
  useEffect(() => {
    entriesRef.current = buildEntriesFromBuffer(buffer, snapshots)
  }, [buffer, snapshots])

  const onProposeRef = useRef(onPropose)
  useEffect(() => {
    onProposeRef.current = onPropose
  }, [onPropose])

  const proposeFiredRef = useRef(false)
  const tools = useMemo(() => {
    const reader = createMapReader(() => entriesRef.current)
    return buildClientTools({
      reader,
      propose: (ops) => {
        if (proposeFiredRef.current) {
          console.warn('[think-pane] propose dedup guard fired — model called propose twice this turn')
          return {
            ok: false,
            reason:
              'propose already called this turn — you must bundle all ops into a single call. Do not call propose again until the user submits a new message.',
          }
        }
        const res = onProposeRef.current(ops)
        if (res.ok) proposeFiredRef.current = true
        else console.warn('[think-pane] onPropose rejected:', res.reason)
        return res
      },
    })
  }, [])

  const { messages, sendMessage, status, clearHistory, error } = useAgentChat({
    agent,
    tools,
    onToolCall: async ({ toolCall, addToolOutput }) => {
      console.log(
        `[think-pane] onToolCall name=${toolCall.toolName} id=${toolCall.toolCallId}`,
      )
      const entry = (tools as Record<string, { execute?: (input: unknown) => unknown }>)[
        toolCall.toolName
      ]
      if (!entry?.execute) {
        console.warn(`[think-pane] onToolCall: no execute for ${toolCall.toolName}`)
        return
      }
      try {
        const output = await entry.execute(toolCall.input)
        addToolOutput({ toolCallId: toolCall.toolCallId, output })
      } catch (e) {
        console.error(
          `[think-pane] onToolCall execute threw for ${toolCall.toolName}:`,
          e,
        )
        addToolOutput({
          toolCallId: toolCall.toolCallId,
          output: null,
          state: 'output-error',
          errorText: e instanceof Error ? e.message : String(e),
        })
      }
    },
    onError: (e) => {
      console.error(
        '[think-pane] useAgentChat error:',
        e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : String(e),
      )
    },
    onFinish: ({ message, isError, isAbort, isDisconnect, finishReason }) => {
      console.log(
        `[think-pane] onFinish msgId=${message?.id} parts=${message?.parts?.length ?? 0} isError=${isError} isAbort=${isAbort} isDisconnect=${isDisconnect} finishReason=${finishReason}`,
      )
    },
  })
  const [draft, setDraft] = useState('')
  const statusBusy = status === 'streaming' || status === 'submitted'
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (statusBusy) {
      setBusy(true)
      return
    }
    if (status === 'error') {
      setBusy(false)
      return
    }
    const id = setTimeout(() => setBusy(false), 500)
    return () => clearTimeout(id)
  }, [statusBusy, status])
  const chatLocked = busy || saving
  useEffect(() => {
    onAiBusyChange?.(busy)
  }, [busy, onAiBusyChange])

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    proposeFiredRef.current = false
    setBusy(true)
    sendMessage({ text })
    setDraft('')
  }

  return (
    <div className="flex-1 bg-[#CCDBE7] flex flex-col overflow-hidden">
      <div className="h-[28px] px-3 flex items-center justify-between border-b border-b-[#9BAFC2] bg-[#D9E3EC] shrink-0 gap-2">
        <PaneLabel>ASSISTANT</PaneLabel>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-slate-500 uppercase tracking-[0.08em]">
            {status}
          </span>
          <button
            type="button"
            disabled={chatLocked}
            onClick={() => {
              proposeFiredRef.current = false
              clearHistory()
            }}
            className="font-mono text-[10px] text-slate-500 hover:text-navy-700 uppercase tracking-[0.08em] disabled:opacity-40 disabled:cursor-not-allowed"
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
          <div className="text-slate-400">
            ask about your ledger, or describe a transaction to stage…
          </div>
        ) : (
          messages.map((m) => <Turn key={m.id} message={m as ThinkMessage} />)
        )}
        {busy ? <BusyIndicator label={status} /> : null}
      </div>

      <form onSubmit={onSubmit} className="p-2 border-t border-slate-300 shrink-0 bg-[#CCDBE7] mt-auto">
        <div className="bg-white flex items-center px-2 h-[36px] border border-slate-300 focus-within:border-[#3B6B8C] transition-colors">
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
            disabled={chatLocked}
            className="bg-transparent border-none focus:ring-0 focus:outline-none text-[11px] font-mono w-full text-navy-600 placeholder:text-slate-400 disabled:opacity-50"
            placeholder={saving ? 'saving…' : 'ask, or describe a transaction to stage…'}
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
            disabled={!draft.trim() || chatLocked}
            title={saving ? 'send (saving)' : 'send'}
            className="bg-[#3B6B8C] text-white w-[24px] h-[24px] flex items-center justify-center hover:bg-[#2B5278] transition-colors shrink-0 ml-1 rounded-[2px] disabled:opacity-40 disabled:cursor-not-allowed"
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
  const visible = message.parts.filter(isVisiblePart)
  if (visible.length === 0) return null
  return (
    <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`px-3 py-2 max-w-[85%] border border-slate-300 ${
          isUser
            ? 'bg-slate-100 text-navy-700 border-l-[3px] border-l-slate-500'
            : 'bg-white text-navy-700 border-l-[3px] border-l-[#3B6B8C]'
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

function BusyIndicator({ label }: { label: string }) {
  const text = label === 'submitted' ? 'thinking' : 'working'
  return (
    <div className="flex items-start">
      <div className="px-3 py-2 border border-slate-300 border-l-[3px] border-l-[#3B6B8C] bg-white flex items-center gap-2">
        <span className="flex gap-1" aria-hidden>
          <span className="w-1 h-1 rounded-full bg-[#3B6B8C] animate-pulse [animation-delay:0ms]" />
          <span className="w-1 h-1 rounded-full bg-[#3B6B8C] animate-pulse [animation-delay:150ms]" />
          <span className="w-1 h-1 rounded-full bg-[#3B6B8C] animate-pulse [animation-delay:300ms]" />
        </span>
        <span className="text-[10px] uppercase tracking-[0.08em] text-[#3B6B8C]">
          {text}…
        </span>
      </div>
    </div>
  )
}

function PartView({ part }: { part: MessagePart }) {
  if (part.type === 'text') {
    const text = (part as { text: string }).text
    if (!text) return null
    return (
      <div className="whitespace-pre-wrap text-[11px] leading-relaxed">
        {text}
      </div>
    )
  }
  if (part.type === 'tool-reply' || part.type === 'tool-propose') {
    const tp = part as ToolPart
    const message = (tp.input as { message?: string } | undefined)?.message
    if (!message) return null
    return (
      <div className="whitespace-pre-wrap text-[11px] leading-relaxed">
        {message}
      </div>
    )
  }
  return null
}

'use client'

import { useAgent } from 'agents/react'
import { useAgentChat } from '@cloudflare/ai-chat/react'
import type { JSONSchema7 } from 'ai'
import { ArrowUp, Mic, Paperclip, Save } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Proposal, Snapshot } from './propose'
import { createMapReader } from '@/lib/ledger-reader/map'
import { createHttpServerReader } from '@/lib/ledger-reader/http-server'
import {
  createMergedReader,
  type AgentRow,
  type AgentSearchResult,
} from '@/lib/ledger-reader/merged'
import {
  buildEntriesFromBuffer,
  renderedIdsFromEntries,
} from '@/lib/ledger-reader/entries'

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

type OnPropose = (p: Proposal) => { ok: boolean; reason?: string }

type SaveStatus = 'idle' | 'saving' | 'conflict' | 'error'

type ThinkPaneProps = {
  email: string
  buffer: string
  snapshots: Snapshot[]
  dirty: boolean
  saveStatus: SaveStatus
  onSave: () => void | Promise<void>
  onPropose: OnPropose
}

export function ThinkPane(props: ThinkPaneProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) {
    return <div className="flex-1 bg-white flex flex-col overflow-hidden" />
  }
  return <ThinkPaneInner {...props} />
}

function ThinkPaneInner({
  email,
  buffer,
  snapshots,
  dirty,
  saveStatus,
  onSave,
  onPropose,
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
  const dirtyRef = useRef(dirty)
  useEffect(() => {
    entriesRef.current = buildEntriesFromBuffer(buffer, snapshots)
    dirtyRef.current = dirty
  }, [buffer, snapshots, dirty])

  const onProposeRef = useRef(onPropose)
  useEffect(() => {
    onProposeRef.current = onPropose
  }, [onPropose])

  const tools = useMemo(() => {
    const serverReader = createHttpServerReader()
    const clientReader = createMapReader(() => entriesRef.current)
    const merged = createMergedReader({
      server: serverReader,
      client: clientReader,
      renderedIds: () => renderedIdsFromEntries(entriesRef.current),
      hasUnsavedChanges: () => dirtyRef.current,
    })

    const schemaSearch: JSONSchema7 = {
      type: 'object',
      properties: {
        q: { type: 'string', default: '' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      },
      additionalProperties: false,
    }
    const schemaGet: JSONSchema7 = {
      type: 'object',
      properties: {
        id: {
          oneOf: [
            { type: 'integer', minimum: 1 },
            { type: 'string', minLength: 1 },
          ],
        },
      },
      required: ['id'],
      additionalProperties: false,
    }
    const schemaCreate: JSONSchema7 = {
      type: 'object',
      properties: { raw_text: { type: 'string', minLength: 1 } },
      required: ['raw_text'],
      additionalProperties: false,
    }
    const schemaUpdate: JSONSchema7 = {
      type: 'object',
      properties: {
        id: {
          oneOf: [
            { type: 'integer', minimum: 1 },
            { type: 'string', minLength: 1 },
          ],
        },
        raw_text: { type: 'string', minLength: 1 },
      },
      required: ['id', 'raw_text'],
      additionalProperties: false,
    }
    const schemaDelete: JSONSchema7 = {
      type: 'object',
      properties: {
        id: {
          oneOf: [
            { type: 'integer', minimum: 1 },
            { type: 'string', minLength: 1 },
          ],
        },
      },
      required: ['id'],
      additionalProperties: false,
    }

    return {
      ledger_search: {
        description:
          "Search the user's transactions. Merges local (viewport + unsaved edits) and server. Each row has `editable` — if false, `reason` tells you whether to ask the user to save or to widen the editor filter. Grammar: @account, #tag, ^link, >YYYY-MM-DD, <YYYY-MM-DD, free tokens.",
        parameters: schemaSearch,
        execute: async (input: unknown): Promise<AgentSearchResult> => {
          const { q = '', limit = 20, offset = 0 } = (input ?? {}) as {
            q?: string
            limit?: number
            offset?: number
          }
          return merged.search(q, limit, offset)
        },
      },
      ledger_get: {
        description:
          'Fetch one transaction by numeric id or tempId (for unsaved-create entries). Returns `editable` + `reason` like ledger_search.',
        parameters: schemaGet,
        execute: async (
          input: unknown,
        ): Promise<AgentRow | { ok: false; reason: string } | null> => {
          const { id } = (input ?? {}) as { id: number | string }
          return merged.get(id)
        },
      },
      propose_create: {
        description:
          'Stage a NEW transaction in the editor buffer. raw_text must be a complete beancount entry. Does NOT save.',
        parameters: schemaCreate,
        execute: async (input: unknown) => {
          const { raw_text } = (input ?? {}) as { raw_text: string }
          return onProposeRef.current({ kind: 'create', raw_text })
        },
      },
      propose_update: {
        description:
          'Stage an edit to an existing transaction in the editor buffer. Pass the id (numeric for saved rows) or tempId (string for unsaved-create rows) returned by ledger_search/ledger_get; `editable` must be true. Pass the full replacement raw_text.',
        parameters: schemaUpdate,
        execute: async (input: unknown) => {
          const { id, raw_text } = (input ?? {}) as {
            id: number | string
            raw_text: string
          }
          if (typeof id === 'string') {
            const entry = entriesRef.current.find((e) => e.tempId === id)
            if (!entry) return { ok: false, reason: `tempId ${id} not found in buffer` }
            return onProposeRef.current({
              kind: 'replace_text',
              old_raw_text: entry.raw_text,
              raw_text,
            })
          }
          return onProposeRef.current({ kind: 'update', id, raw_text })
        },
      },
      propose_delete: {
        description:
          'Stage removal of a transaction from the editor buffer. Pass id (numeric) or tempId (string); `editable` must be true.',
        parameters: schemaDelete,
        execute: async (input: unknown) => {
          const { id } = (input ?? {}) as { id: number | string }
          if (typeof id === 'string') {
            const entry = entriesRef.current.find((e) => e.tempId === id)
            if (!entry) return { ok: false, reason: `tempId ${id} not found in buffer` }
            return onProposeRef.current({
              kind: 'delete_text',
              old_raw_text: entry.raw_text,
            })
          }
          return onProposeRef.current({ kind: 'delete', id })
        },
      },
    }
  }, [])

  const { messages, sendMessage, status, clearHistory, error } = useAgentChat({
    agent,
    tools,
    onToolCall: async ({ toolCall, addToolOutput }) => {
      const entry = (tools as Record<string, { execute?: (input: unknown) => unknown }>)[
        toolCall.toolName
      ]
      if (!entry?.execute) return
      try {
        const output = await entry.execute(toolCall.input)
        addToolOutput({ toolCallId: toolCall.toolCallId, output })
      } catch (e) {
        addToolOutput({
          toolCallId: toolCall.toolCallId,
          output: null,
          state: 'output-error',
          errorText: e instanceof Error ? e.message : String(e),
        })
      }
    },
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
            onClick={() => {
              clearHistory()
            }}
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
          <div className="text-slate-400">
            ask about your ledger, or describe a transaction to stage…
          </div>
        ) : (
          messages.map((m, idx) => (
            <Turn
              key={m.id}
              message={m as ThinkMessage}
              isLast={idx === messages.length - 1}
              dirty={dirty}
              saveStatus={saveStatus}
              onSave={onSave}
            />
          ))
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
            placeholder="ask, or describe a transaction to stage…"
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

function Turn({
  message,
  isLast,
  dirty,
  saveStatus,
  onSave,
}: {
  message: ThinkMessage
  isLast: boolean
  dirty: boolean
  saveStatus: SaveStatus
  onSave: () => void | Promise<void>
}) {
  const isUser = message.role === 'user'
  const showSaveCard =
    isLast &&
    !isUser &&
    dirty &&
    message.parts.some((p) => {
      if (typeof p.type !== 'string' || !p.type.startsWith('tool-propose_')) return false
      const tp = p as ToolPart
      const out = tp.output as { ok?: boolean } | undefined
      return out?.ok === true
    })
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
      {showSaveCard ? <SaveCard saveStatus={saveStatus} onSave={onSave} /> : null}
    </div>
  )
}

function SaveCard({
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
  const tone =
    saveStatus === 'conflict' || saveStatus === 'error'
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

function PartView({ part }: { part: MessagePart }) {
  if (part.type === 'text') {
    return (
      <div className="whitespace-pre-wrap text-[11px] leading-relaxed">
        {(part as { text: string }).text}
      </div>
    )
  }
  if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
    const tp = part as ToolPart
    const toolName = tp.type.replace(/^tool-/, '')
    const isPropose = toolName.startsWith('propose_')
    return (
      <pre
        className={`mt-1 first:mt-0 overflow-x-auto text-[10px] leading-snug whitespace-pre-wrap ${
          isPropose ? 'text-sky-700' : 'text-slate-600'
        }`}
      >
        <span className="text-slate-400">→ {toolName}</span>
        {tp.input !== undefined ? `\n${JSON.stringify(tp.input)}` : ''}
        {tp.output !== undefined ? `\n← ${JSON.stringify(tp.output)}` : ''}
      </pre>
    )
  }
  return null
}

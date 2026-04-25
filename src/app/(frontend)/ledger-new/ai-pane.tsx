'use client'

import { useAgent } from 'agents/react'
import { useAgentChat } from '@cloudflare/ai-chat/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Op, Snapshot } from './propose'
import { createMapReader } from '@/lib/ledger-reader/map'
import { buildEntriesFromBuffer } from '@/lib/ledger-reader/entries'
import { buildClientTools } from './ai-tools-client'
import { AiPaneView, type ChatMessage } from './ai-pane-view'

export { AiPaneView } from './ai-pane-view'
export type { ChatMessage, MessagePart, AiPaneViewProps } from './ai-pane-view'

type OnPropose = (ops: readonly Op[]) => { ok: boolean; reason?: string }

type AiPaneProps = {
  email: string
  buffer: string
  snapshots: Snapshot[]
  saving?: boolean
  onPropose: OnPropose
  onAiBusyChange?: (busy: boolean) => void
}

const PANE_PLACEHOLDER_CLS =
  'hidden md:flex w-[360px] shrink-0 border-l border-slate-200 bg-[#F4F6F8] flex-col'

export function AiPane(props: AiPaneProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <aside className={PANE_PLACEHOLDER_CLS} />
  if (process.env.STORYBOOK === 'true') {
    return (
      <AiPaneView
        messages={[]}
        status="idle"
        busy={false}
        saving={props.saving ?? false}
        chatLocked={props.saving ?? false}
        errorMessage={null}
        onSubmit={() => {}}
        onClear={() => {}}
      />
    )
  }
  return <AiPaneInner {...props} />
}

function AiPaneInner({
  email,
  buffer,
  snapshots,
  saving = false,
  onPropose,
  onAiBusyChange,
}: AiPaneProps) {
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
          console.warn('[ai-pane] propose dedup guard fired — model called propose twice this turn')
          return {
            ok: false,
            reason:
              'propose already called this turn — you must bundle all ops into a single call. Do not call propose again until the user submits a new message.',
          }
        }
        const res = onProposeRef.current(ops)
        if (res.ok) proposeFiredRef.current = true
        else console.warn('[ai-pane] onPropose rejected:', res.reason)
        return res
      },
    })
  }, [])

  const { messages, sendMessage, status, clearHistory, error } = useAgentChat({
    agent,
    tools,
    onToolCall: async ({ toolCall, addToolOutput }) => {
      console.log(
        `[ai-pane] onToolCall name=${toolCall.toolName} id=${toolCall.toolCallId}`,
      )
      const entry = (tools as Record<string, { execute?: (input: unknown) => unknown }>)[
        toolCall.toolName
      ]
      if (!entry?.execute) {
        console.warn(`[ai-pane] onToolCall: no execute for ${toolCall.toolName}`)
        return
      }
      try {
        const output = await entry.execute(toolCall.input)
        addToolOutput({ toolCallId: toolCall.toolCallId, output })
      } catch (e) {
        console.error(
          `[ai-pane] onToolCall execute threw for ${toolCall.toolName}:`,
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
        '[ai-pane] useAgentChat error:',
        e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : String(e),
      )
    },
    onFinish: ({ message, isError, isAbort, isDisconnect, finishReason }) => {
      console.log(
        `[ai-pane] onFinish msgId=${message?.id} parts=${message?.parts?.length ?? 0} isError=${isError} isAbort=${isAbort} isDisconnect=${isDisconnect} finishReason=${finishReason}`,
      )
    },
  })

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

  useEffect(() => {
    console.log(`[ai-pane] status=${status} msgs=${messages.length} busy=${busy}`)
  }, [status, messages.length, busy])

  const onSubmit = (text: string) => {
    if (!text || chatLocked) return
    console.log(`[ai-pane] sendMessage textLen=${text.length}`)
    proposeFiredRef.current = false
    setBusy(true)
    sendMessage({ text })
  }

  const onClear = () => {
    console.log('[ai-pane] clearHistory')
    proposeFiredRef.current = false
    setBusy(false)
    clearHistory()
  }

  return (
    <AiPaneView
      messages={messages as ChatMessage[]}
      status={status}
      busy={busy}
      saving={saving}
      chatLocked={chatLocked}
      errorMessage={error?.message ?? null}
      onSubmit={onSubmit}
      onClear={onClear}
    />
  )
}

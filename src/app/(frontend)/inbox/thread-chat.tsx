'use client'

import { useState } from 'react'
import { useAgent } from 'agents/react'
import { useAgentChat } from '@cloudflare/ai-chat/react'
import type { ToolUIPart } from 'ai'
import type { ChatDOState } from '@/durable/chat-do'
import { ledgerClient, isReplaceBufferError, commitDraftOps } from '@/lib/ledger-client-browser'
import type { DraftOp } from '@/app/(frontend)/ai/gen-ui/draft-transaction'
import { isGenUiTool, renderGenUi } from '../ai/gen-ui'
import { Conversation, ConversationContent } from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import {
  PromptInput,
  PromptInputProvider,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'
import { Tool, ToolHeader, ToolContent } from '@/components/ai-elements/tool'

type Part = {
  type: string
  text?: string
  toolName?: string | null
  toolCallId?: string
  state?: string
  input?: unknown
  output?: unknown
  errorText?: string
}

// Per-Inbox-item conversation. Each item gets its own ChatDO instance
// (named "<email>::<captureId>" by the agents route when ?thread= is set) —
// fully isolated history, destroyed when the item is posted or dismissed.
// The server pins the thread to its statement via the system prompt, so the
// agent can read_statement without the user pasting ids.
export function InboxThreadChat({
  captureId,
  onPosted,
}: {
  captureId: string
  onPosted: () => void
}) {
  const agent = useAgent<ChatDOState>({
    agent: 'ChatDO',
    basePath: 'api/agents/editor',
    query: { thread: captureId },
  })
  const { messages, sendMessage, status, addToolOutput } = useAgentChat({
    agent,
    autoContinueAfterToolResult: false,
    getInitialMessages: null,
  })
  const [submitState, setSubmitState] = useState<
    Record<string, 'submitting' | 'done' | 'failed'>
  >({})
  const [submitError, setSubmitError] = useState<Record<string, string>>({})

  async function approve(toolCallId: string, ops: DraftOp[]) {
    setSubmitState((s) => ({ ...s, [toolCallId]: 'submitting' }))
    try {
      const committed = await commitDraftOps(ops)
      if (committed.ok === false) {
        const err = committed.error
        setSubmitState((s) => ({ ...s, [toolCallId]: 'failed' }))
        setSubmitError((s) => ({ ...s, [toolCallId]: err }))
        addToolOutput({
          toolCallId,
          output: { ok: false, error: err },
          state: 'output-error',
          errorText: err,
        })
        return
      }
      const { result: r, finalText } = committed
      if (isReplaceBufferError(r)) {
        const message = 'message' in r ? r.message : 'Save conflict'
        setSubmitState((s) => ({ ...s, [toolCallId]: 'failed' }))
        setSubmitError((s) => ({ ...s, [toolCallId]: message }))
        addToolOutput({
          toolCallId,
          output: { ok: false, error: message },
          state: 'output-error',
          errorText: message,
        })
        return
      }
      setSubmitState((s) => ({ ...s, [toolCallId]: 'done' }))
      addToolOutput({
        toolCallId,
        output: { ok: true, committed: finalText.trim() },
      })
      // Advance the capture lifecycle; surfacing failure rather than
      // swallowing it (the journal write above already succeeded).
      const post = await fetch('/api/ledger/captures', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: captureId, action: 'post' }),
      }).catch((): null => null)
      if (!post?.ok) {
        setSubmitError((s) => ({
          ...s,
          [toolCallId]: 'Posted to the journal, but the Inbox update failed — refresh.',
        }))
        return
      }
      onPosted()
    } catch (e) {
      setSubmitState((s) => ({ ...s, [toolCallId]: 'failed' }))
      setSubmitError((s) => ({ ...s, [toolCallId]: e instanceof Error ? e.message : String(e) }))
    }
  }

  function reject(toolCallId: string) {
    setSubmitState((s) => ({ ...s, [toolCallId]: 'done' }))
    addToolOutput({ toolCallId, output: { ok: false, reason: 'rejected' } })
  }

  const isLive = status === 'streaming' || status === 'submitted'

  function onSubmit(message: PromptInputMessage) {
    const text = message.text?.trim()
    if (!text || isLive) return
    void sendMessage({ text })
  }

  return (
    <div className="flex max-h-[28rem] flex-col">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="py-3">
          {messages.length === 0 ? (
            <p className="px-1 text-xs text-muted-foreground">
              Ask about this statement — categorisation, a specific row, fixes to the
              drafts above. The agent reads the statement itself.
            </p>
          ) : null}
          {messages.map((m) => {
            const parts = Array.isArray(m.parts) ? (m.parts as Part[]) : []
            return (
              <Message key={m.id} from={m.role}>
                <MessageContent className={m.role === 'assistant' ? 'w-full' : undefined}>
                  {parts.map((p, i) => {
                    if (p.type === 'text' && typeof p.text === 'string' && p.text.trim()) {
                      return <MessageResponse key={i}>{p.text}</MessageResponse>
                    }
                    const isTool = p.type === 'dynamic-tool' || p.type.startsWith('tool-')
                    if (!isTool) return null
                    const toolName =
                      p.type === 'dynamic-tool'
                        ? (p.toolName ?? null)
                        : p.type.slice('tool-'.length)
                    const toolCallId = p.toolCallId ?? `${m.id}:${i}`
                    const sub = submitState[toolCallId]
                    const outputObj =
                      p.output && typeof p.output === 'object'
                        ? (p.output as { ok?: boolean; reason?: string })
                        : null
                    const isRejection =
                      p.state === 'output-error' ||
                      (p.state === 'output-available' && outputObj?.ok === false)
                    const cardStatus = isRejection
                      ? 'rejected'
                      : p.state === 'output-available' || sub === 'done'
                        ? 'done'
                        : sub === 'submitting'
                          ? 'submitting'
                          : sub === 'failed'
                            ? 'failed'
                            : 'idle'
                    const dead = p.state === 'input-streaming' && !isLive
                    const rendered =
                      !dead && toolName && isGenUiTool(toolName) && p.state !== 'input-streaming'
                        ? renderGenUi(toolName, p.input, {
                            accounts: [],
                            status: cardStatus,
                            errorMessage: submitError[toolCallId] ?? p.errorText,
                            onApprove: (final) => void approve(toolCallId, final),
                            onReject: () => reject(toolCallId),
                          })
                        : null
                    return (
                      <Tool key={i} defaultOpen>
                        <ToolHeader
                          title={toolName ?? undefined}
                          type={p.type as ToolUIPart['type']}
                          state={
                            dead
                              ? 'output-error'
                              : ((p.state as ToolUIPart['state'] | undefined) ??
                                'input-streaming')
                          }
                        />
                        <ToolContent>
                          {dead ? (
                            <div className="p-3 text-xs text-muted-foreground">
                              Interrupted — this call never completed.
                            </div>
                          ) : rendered ? (
                            <div className="p-2">{rendered}</div>
                          ) : (
                            <div className="p-3 text-xs text-muted-foreground">
                              {p.state === 'input-streaming' ? 'Preparing…' : 'Working…'}
                            </div>
                          )}
                        </ToolContent>
                      </Tool>
                    )
                  })}
                </MessageContent>
              </Message>
            )
          })}
        </ConversationContent>
      </Conversation>
      <PromptInputProvider>
        <PromptInput onSubmit={onSubmit}>
          <PromptInputTextarea placeholder="Ask about this statement…" />
          <PromptInputFooter>
            <PromptInputSubmit
              status={isLive ? 'streaming' : 'ready'}
              disabled={isLive}
            />
          </PromptInputFooter>
        </PromptInput>
      </PromptInputProvider>
    </div>
  )
}

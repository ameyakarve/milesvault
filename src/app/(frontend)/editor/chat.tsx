'use client'

import { useEffect, useState } from 'react'
import { useAgent } from 'agents/react'
import { useAgentChat } from '@cloudflare/ai-chat/react'
import { ArrowUp, Eraser } from 'lucide-react'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Loader } from '@/components/ai-elements/loader'
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning'
import {
  Tool,
  ToolContent,
  ToolHeader,
} from '@/components/ai-elements/tool'
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'
import { Button } from '@/components/ui/button'
import { isGenUiTool, renderGenUi } from '@/app/(frontend)/ai/gen-ui'
import type { DraftTransaction } from '@/durable/agent-ui-schemas'
import { ledgerClient, isJournalPutError } from '@/lib/ledger-client-browser'
import { serializeTransactionInput } from '@/lib/beancount/ast'
import type { TransactionInput } from '@/durable/ledger-types'
import type { ToolUIPart } from 'ai'

type Part = {
  type: string
  text?: string
  state?: ToolUIPart['state'] | 'streaming' | 'done'
  input?: unknown
  output?: unknown
  errorText?: string
  toolCallId?: string
  [k: string]: unknown
}

function draftToTxnInput(d: DraftTransaction): TransactionInput {
  return {
    date: d.date,
    flag: d.flag ?? '*',
    payee: d.payee,
    narration: d.narration,
    postings: d.postings.map((p) => ({
      account: p.account,
      amount: String(p.amount),
      currency: p.currency,
    })),
  }
}

function Composer({
  onSubmit,
  status,
  onStop,
}: {
  onSubmit: (m: PromptInputMessage) => void
  status: ReturnType<typeof useAgentChat>['status']
  onStop: () => void
}) {
  return (
    <PromptInput onSubmit={onSubmit}>
      <PromptInputTextarea placeholder="Ask anything" />
      <PromptInputFooter>
        <PromptInputTools />
        <PromptInputSubmit status={status} onStop={onStop}>
          <ArrowUp className="size-4" strokeWidth={2.5} />
        </PromptInputSubmit>
      </PromptInputFooter>
    </PromptInput>
  )
}

export function Chat({
  onBusyChange,
}: {
  onBusyChange?: (busy: boolean) => void
} = {}) {
  const agent = useAgent({ agent: 'LedgerDO', basePath: 'api/agents' })
  const {
    messages,
    sendMessage,
    status,
    stop,
    addToolOutput,
    clearHistory,
    isStreaming,
    isToolContinuation,
  } = useAgentChat({
    agent,
    // The card IS the proposal; don't let the model continue after a tool
    // result. Approve transitions the card to "done" locally and we're
    // ready for the next user message. Reject just dismisses the card —
    // no apology / retry from the model.
    autoContinueAfterToolResult: false,
  })

  const [submitStatus, setSubmitStatus] = useState<
    Record<string, 'idle' | 'submitting' | 'done' | 'failed'>
  >({})
  const [submitError, setSubmitError] = useState<Record<string, string>>({})
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<string, string[]>>({})
  const [accounts, setAccounts] = useState<string[]>([])

  useEffect(() => {
    const ac = new AbortController()
    ledgerClient
      .getAccounts({ signal: ac.signal })
      .then((r) => setAccounts(r.accounts))
      .catch(() => {})
    return () => ac.abort()
  }, [])

  async function refreshAccounts() {
    try {
      const r = await ledgerClient.getAccounts()
      setAccounts(r.accounts)
    } catch {}
  }

  const busy = isStreaming
  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])

  function handleSubmit(message: PromptInputMessage) {
    const text = message.text.trim()
    if (!text) return
    // Any tool cards still awaiting a decision get superseded by the new
    // message — otherwise the agent stays stuck waiting on them.
    for (const m of messages) {
      const parts = Array.isArray(m.parts) ? (m.parts as Part[]) : []
      for (const p of parts) {
        if (!p.type.startsWith('tool-')) continue
        if (!p.toolCallId) continue
        if (p.state !== 'input-available' && p.state !== 'input-streaming') continue
        const sub = submitStatus[p.toolCallId]
        if (sub === 'done' || sub === 'failed' || sub === 'submitting') continue
        addToolOutput({
          toolCallId: p.toolCallId,
          output: { ok: false, reason: 'superseded' },
        })
      }
    }
    void sendMessage({ text })
  }

  async function handleApprove(toolCallId: string, final: DraftTransaction) {
    setSubmitStatus((s) => ({ ...s, [toolCallId]: 'submitting' }))
    setSubmitError((s) => {
      const { [toolCallId]: _drop, ...rest } = s
      return rest
    })
    try {
      const cur = await ledgerClient.getJournal()
      const newTxn = serializeTransactionInput(draftToTxnInput(final))
      const next = cur.text ? cur.text.replace(/\s*$/, '\n\n') + newTxn : newTxn
      const r = await ledgerClient.putJournal(next)
      if (isJournalPutError(r)) {
        setSubmitStatus((s) => ({ ...s, [toolCallId]: 'failed' }))
        setSubmitError((s) => ({ ...s, [toolCallId]: r.message }))
        addToolOutput({
          toolCallId,
          output: { ok: false, error: r.message },
          state: 'output-error',
          errorText: r.message,
        })
        return
      }
      setSubmitStatus((s) => ({ ...s, [toolCallId]: 'done' }))
      addToolOutput({
        toolCallId,
        output: { ok: true, committed: newTxn.trim() },
      })
      void refreshAccounts()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed'
      setSubmitStatus((s) => ({ ...s, [toolCallId]: 'failed' }))
      setSubmitError((s) => ({ ...s, [toolCallId]: msg }))
      addToolOutput({
        toolCallId,
        output: { ok: false, error: msg },
        state: 'output-error',
        errorText: msg,
      })
    }
  }

  function handleReject(toolCallId: string) {
    addToolOutput({
      toolCallId,
      output: { ok: false, reason: 'rejected' },
    })
  }

  function handleClarifyAnswer(toolCallId: string, answers: string[]) {
    setClarifyAnswers((s) => ({ ...s, [toolCallId]: answers }))
    addToolOutput({
      toolCallId,
      output: { answers },
    })
    // clarify NEEDS continuation — the model asked, the user answered, the
    // model must now produce the next step (typically draft_transaction).
    // draft_transaction stays halting via autoContinueAfterToolResult: false;
    // we manually nudge here with an empty user message.
    void sendMessage({ text: '' })
  }

  const isEmpty = messages.length === 0
  const showThinking =
    (status === 'submitted' || status === 'streaming') && !isToolContinuation
  const hasAssistantContent = (() => {
    if (messages.length === 0) return false
    const last = messages[messages.length - 1]
    if (last.role !== 'assistant') return false
    const parts = Array.isArray(last.parts) ? (last.parts as Part[]) : []
    return parts.some(
      (p) =>
        (p.type === 'text' && typeof p.text === 'string' && p.text.length > 0) ||
        p.type === 'reasoning' ||
        p.type.startsWith('tool-'),
    )
  })()
  const showThinkingBubble = showThinking && !hasAssistantContent

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {!isEmpty ? (
        <div className="flex items-center justify-end px-4 pt-2 sm:px-6">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => clearHistory()}
            disabled={busy}
          >
            <Eraser className="size-3.5" />
            Clear
          </Button>
        </div>
      ) : null}

      {isEmpty ? (
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="flex w-full max-w-3xl -translate-y-8 flex-col items-center gap-7">
            <h1 className="text-3xl font-semibold tracking-tight">
              How can I help?
            </h1>
            <div className="w-full">
              <Composer onSubmit={handleSubmit} status={status} onStop={stop} />
            </div>
          </div>
        </div>
      ) : (
        <>
          <Conversation>
            <ConversationContent className="mx-auto w-full max-w-3xl py-6">
              {messages.map((m) => {
                const parts = Array.isArray(m.parts) ? (m.parts as Part[]) : []
                return (
                  <Message key={m.id} from={m.role}>
                    <MessageContent
                      className={m.role === 'assistant' ? 'w-full' : undefined}
                    >
                      {parts.map((p, i) => {
                        if (p.type === 'text' && typeof p.text === 'string') {
                          return (
                            <MessageResponse key={i}>{p.text}</MessageResponse>
                          )
                        }
                        if (p.type === 'reasoning' && typeof p.text === 'string') {
                          return (
                            <Reasoning
                              key={i}
                              isStreaming={p.state === 'streaming'}
                              defaultOpen={false}
                            >
                              <ReasoningTrigger />
                              <ReasoningContent>{p.text}</ReasoningContent>
                            </Reasoning>
                          )
                        }
                        if (p.type.startsWith('tool-')) {
                          const toolCallId = p.toolCallId ?? `${m.id}-${i}`
                          const subState = submitStatus[toolCallId] ?? 'idle'
                          const outputObj =
                            p.output && typeof p.output === 'object'
                              ? (p.output as { ok?: boolean; reason?: string })
                              : null
                          const isRejection =
                            p.state === 'output-available' &&
                            outputObj?.ok === false &&
                            (outputObj.reason === 'rejected' ||
                              outputObj.reason === 'superseded')
                          const cardStatus = isRejection
                            ? 'rejected'
                            : p.state === 'output-available' || subState === 'done'
                              ? 'done'
                              : subState === 'submitting'
                                ? 'submitting'
                                : subState === 'failed' || p.state === 'output-error'
                                  ? 'failed'
                                  : 'idle'
                          const toolState: ToolUIPart['state'] =
                            cardStatus === 'done' || cardStatus === 'rejected'
                              ? 'output-available'
                              : cardStatus === 'failed'
                                ? 'output-error'
                                : cardStatus === 'submitting'
                                  ? 'input-available'
                                  : ((p.state as ToolUIPart['state'] | undefined) ?? 'input-streaming')
                          const rendered = isGenUiTool(p.type)
                            ? renderGenUi(p.type, p.input, {
                                accounts,
                                status: cardStatus,
                                errorMessage: submitError[toolCallId],
                                resolvedAnswers: clarifyAnswers[toolCallId],
                                onApprove: (final) =>
                                  void handleApprove(toolCallId, final),
                                onAnswer: (answers) =>
                                  handleClarifyAnswer(toolCallId, answers),
                                onReject: () => handleReject(toolCallId),
                              })
                            : null
                          return (
                            <Tool key={i} defaultOpen>
                              <ToolHeader
                                type={p.type as ToolUIPart['type']}
                                state={toolState}
                              />
                              <ToolContent>
                                {rendered ? (
                                  <div className="p-2">{rendered}</div>
                                ) : (
                                  <div className="p-4 text-xs text-muted-foreground">
                                    {toolState === 'input-streaming'
                                      ? 'Preparing…'
                                      : 'Waiting for input…'}
                                  </div>
                                )}
                              </ToolContent>
                            </Tool>
                          )
                        }
                        return null
                      })}
                    </MessageContent>
                  </Message>
                )
              })}
              {showThinkingBubble ? (
                <Message from="assistant">
                  <MessageContent>
                    <Loader />
                  </MessageContent>
                </Message>
              ) : null}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          <div className="mx-auto w-full max-w-3xl px-4 pb-4">
            <Composer onSubmit={handleSubmit} status={status} onStop={stop} />
            <p className="mt-2 text-center text-xs text-muted-foreground">
              MilesVault can make mistakes. Check important info.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

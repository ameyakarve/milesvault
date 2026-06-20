'use client'

import { useState } from 'react'
import { useAgent } from 'agents/react'
import { useAgentChat } from '@cloudflare/ai-chat/react'
import { ArrowUp, Database, Trash2 } from 'lucide-react'
import { Loader } from '@/components/ai-elements/loader'
import { Button } from '@/components/ui/button'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning'
import { Tool, ToolContent, ToolHeader } from '@/components/ai-elements/tool'
import { isGenUiTool, renderGenUi } from '@/app/(frontend)/ai/gen-ui'
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'
import type { ToolUIPart } from 'ai'
import type { ConciergeDOState } from '@/durable/concierge-do'

type Part = {
  type: string
  text?: string
  state?: ToolUIPart['state'] | 'streaming' | 'done'
  input?: unknown
  output?: unknown
  errorText?: string
  toolName?: string
  toolCallId?: string
  [k: string]: unknown
}

function isToolPart(p: Part): boolean {
  return p.type.startsWith('tool-') || p.type === 'dynamic-tool'
}

function toolNameOf(p: Part): string | null {
  if (p.type === 'dynamic-tool') return typeof p.toolName === 'string' ? p.toolName : null
  if (p.type.startsWith('tool-')) return p.type.slice(5)
  return null
}

export function ConciergeChat() {
  const agent = useAgent<ConciergeDOState>({
    agent: 'ConciergeDO',
    basePath: 'api/agents/concierge',
  })
  const { messages, sendMessage, addToolOutput, status, isStreaming, clearHistory, stop } =
    useAgentChat({
    agent,
    autoContinueAfterToolResult: true,
    getInitialMessages: null,
  })

  const [text, setText] = useState('')

  // Walk the latest assistant message for a still-pending `ask_user`
  // dynamic-tool call. If we find one, the next user message resolves
  // that tool instead of starting a fresh turn — the agent is paused
  // waiting on the answer.
  const pendingAskUser = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.role !== 'assistant') continue
      const parts = (m.parts ?? []) as Part[]
      for (const p of parts) {
        if (
          p.type === 'dynamic-tool' &&
          p.toolName === 'ask_user' &&
          (p.state === 'input-available' || p.state === 'input-streaming') &&
          typeof p.toolCallId === 'string'
        ) {
          const question =
            typeof p.input === 'object' && p.input !== null && 'question' in p.input
              ? String((p.input as { question?: unknown }).question ?? '')
              : ''
          return { toolCallId: p.toolCallId, question }
        }
      }
      // Stop at the most recent assistant message — older ones can't be pending.
      break
    }
    return null
  })()

  function handleSubmit(message: PromptInputMessage) {
    const value = (message.text ?? '').trim()
    if (!value) return
    if (pendingAskUser) {
      addToolOutput({
        toolCallId: pendingAskUser.toolCallId,
        output: { answer: value },
      })
    } else {
      void sendMessage({ text: value })
    }
    setText('')
  }

  // Generic resolution for a gen-UI tool card that the user dismisses. The
  // concierge's gen-UI tools are read-only display cards (e.g. award options),
  // so there is no approve/answer round-trip — reject just unblocks the agent.
  function handleReject(toolCallId: string) {
    addToolOutput({
      toolCallId,
      output: { ok: false, reason: 'rejected' },
    })
  }

  const isEmpty = messages.length === 0
  const busy = status === 'submitted' || status === 'streaming' || isStreaming

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-4 border-b border-border bg-card px-6 py-3">
        <div>
          <h1 className="text-sm font-semibold text-foreground">Concierge</h1>
          <p className="text-xs text-muted-foreground">
            Ask anything about your ledger — spending, balances, trends.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => clearHistory()}
          disabled={messages.length === 0 || busy}
          title="Clear conversation"
          aria-label="Clear conversation"
        >
          <Trash2 className="size-3.5" />
          Clear
        </Button>
      </header>

      <Conversation className="flex-1">
        <ConversationContent role="log" aria-live="polite" aria-atomic={false} className="mx-auto w-full max-w-3xl px-4">
          {isEmpty ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
              <Database className="size-6" />
              <p className="text-sm">
                Ask a question to get started — e.g. &ldquo;How much did I spend on restaurants last
                month?&rdquo;
              </p>
              <TelegramPairHint />
            </div>
          ) : null}

          {messages.map((m) => {
            const parts = (m.parts ?? []) as Part[]
            return (
              <Message key={m.id} from={m.role === 'user' ? 'user' : 'assistant'}>
                <MessageContent>
                  {parts.map((p, i) => {
                    if (p.type === 'text' && typeof p.text === 'string') {
                      return m.role === 'assistant' ? (
                        <MessageResponse key={i}>{p.text}</MessageResponse>
                      ) : (
                        <span key={i} className="whitespace-pre-wrap">
                          {p.text}
                        </span>
                      )
                    }
                    if (p.type === 'reasoning' && typeof p.text === 'string') {
                      return (
                        <Reasoning key={i} isStreaming={p.state === 'streaming'}>
                          <ReasoningTrigger />
                          <ReasoningContent>{p.text}</ReasoningContent>
                        </Reasoning>
                      )
                    }
                    if (isToolPart(p)) {
                      const name = toolNameOf(p) ?? 'tool'
                      const toolCallId = p.toolCallId ?? `${m.id}-${i}`
                      const toolState = (p.state as ToolUIPart['state']) ?? 'output-available'
                      // Gen-UI tools render as a component from the tool-call
                      // input. Wait for input-available — partial streamed args
                      // would render a half-formed card. The card self-fetches
                      // its data, so no output round-trip is needed here.
                      const card =
                        isGenUiTool(name) && toolState !== 'input-streaming'
                          ? renderGenUi(name, p.input, {
                              status:
                                toolState === 'output-error'
                                  ? 'failed'
                                  : toolState === 'output-available'
                                    ? 'done'
                                    : 'idle',
                              errorMessage: p.errorText,
                              onReject: () => handleReject(toolCallId),
                            })
                          : null
                      if (card) return <div key={i}>{card}</div>
                      return (
                        <Tool key={i}>
                          <ToolHeader type={`tool-${name}`} state={toolState} />
                          <ToolContent>
                            {p.input ? (
                              <pre className="overflow-x-auto rounded bg-muted p-2 text-xs text-foreground">
                                {JSON.stringify(p.input, null, 2)}
                              </pre>
                            ) : null}
                            {p.errorText ? (
                              <p className="text-xs text-destructive">{p.errorText}</p>
                            ) : null}
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

          {busy ? (
            <div
              role="status"
              aria-label="Assistant is thinking"
              className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground"
            >
              <Loader size={14} />
              thinking…
            </div>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask about your ledger…"
          />
          <PromptInputFooter>
            <PromptInputTools />
            <PromptInputSubmit status={status} onStop={stop} disabled={!text.trim() || busy}>
              <ArrowUp className="size-4" />
            </PromptInputSubmit>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}

// Pair this account with the Telegram bot (docs/design/assistant-merge.md):
// mints a single-use code and shows the /start command to send to the bot.
function TelegramPairHint() {
  const [command, setCommand] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (command) {
    return (
      <p className="text-xs text-muted-foreground">
        Send <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">{command}</code>{' '}
        to the MilesVault Telegram bot within 15 minutes to link this account.
      </p>
    )
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true)
        fetch('/api/bot/pairing-code', { method: 'POST' })
          .then((r) => (r.ok ? (r.json() as Promise<{ command?: string }>) : null))
          .then((d) => d?.command && setCommand(d.command))
          .catch(() => {})
          .finally(() => setBusy(false))
      }}
      className="text-xs text-foreground underline underline-offset-4 hover:no-underline disabled:opacity-50"
    >
      Use me on Telegram →
    </button>
  )
}

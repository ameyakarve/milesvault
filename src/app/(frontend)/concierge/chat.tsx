'use client'

import { useState } from 'react'
import { useAgent } from 'agents/react'
import { useAgentChat } from '@cloudflare/ai-chat/react'
import { ArrowUp, Database, Loader2, Trash2 } from 'lucide-react'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
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
  [k: string]: unknown
}

function isToolPart(p: Part): boolean {
  return p.type.startsWith('tool-') || p.type === 'dynamic-tool'
}

function toolNameOf(p: Part): string | null {
  if (p.type === 'dynamic-tool')
    return typeof p.toolName === 'string' ? p.toolName : null
  if (p.type.startsWith('tool-')) return p.type.slice(5)
  return null
}

export function ConciergeChat() {
  const agent = useAgent<ConciergeDOState>({
    agent: 'ConciergeDO',
    basePath: 'api/agents/concierge',
  })
  const { messages, sendMessage, status, isStreaming, clearHistory } =
    useAgentChat({
      agent,
      autoContinueAfterToolResult: true,
      getInitialMessages: null,
    })

  const [text, setText] = useState('')

  function handleSubmit(message: PromptInputMessage) {
    const value = (message.text ?? '').trim()
    if (!value) return
    void sendMessage({ text: value })
    setText('')
  }

  const isEmpty = messages.length === 0
  const busy =
    status === 'submitted' || status === 'streaming' || isStreaming

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-3">
        <div>
          <h1 className="text-sm font-semibold text-slate-700">Concierge</h1>
          <p className="text-xs text-slate-500">
            Ask anything about your ledger — spending, balances, trends.
          </p>
        </div>
        <button
          type="button"
          onClick={() => clearHistory()}
          disabled={messages.length === 0 || busy}
          title="Clear conversation"
          aria-label="Clear conversation"
          className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-500"
        >
          <Trash2 className="size-3.5" />
          Clear
        </button>
      </header>

      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl px-4">
          {isEmpty ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-slate-400">
              <Database className="size-6" />
              <p className="text-sm">
                Ask a question to get started — e.g. &ldquo;How much did I spend
                on restaurants last month?&rdquo;
              </p>
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
                      return (
                        <Tool key={i}>
                          <ToolHeader
                            type={`tool-${name}`}
                            state={
                              (p.state as ToolUIPart['state']) ??
                              'output-available'
                            }
                          />
                          <ToolContent>
                            {p.input ? (
                              <pre className="overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-700">
                                {JSON.stringify(p.input, null, 2)}
                              </pre>
                            ) : null}
                            {p.errorText ? (
                              <p className="text-xs text-red-600">
                                {p.errorText}
                              </p>
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
            <div className="flex items-center gap-2 px-2 py-3 text-xs text-slate-400">
              <Loader2 className="size-3 animate-spin" />
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
            <PromptInputSubmit
              status={status}
              disabled={!text.trim() || busy}
            >
              <ArrowUp className="size-4" />
            </PromptInputSubmit>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}

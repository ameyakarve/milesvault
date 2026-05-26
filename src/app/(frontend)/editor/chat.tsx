'use client'

import { useEffect } from 'react'
import { useAgent } from 'agents/react'
import { useAgentChat } from '@cloudflare/ai-chat/react'
import { ArrowUp } from 'lucide-react'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { MessageResponse } from '@/components/ai-elements/message'
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'

type Part = { type: string; text?: string; [k: string]: unknown }

function partsToText(parts: unknown): string {
  if (!Array.isArray(parts)) return ''
  return (parts as Part[])
    .filter((p) => p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('')
}

const COMPOSER_CLASSES =
  '[&>div]:h-auto [&>div]:rounded-[28px] [&>div]:border [&>div]:border-slate-200/80 [&>div]:bg-white [&>div]:shadow-[0_2px_12px_rgba(0,0,0,0.04)] [&>div]:transition-shadow [&>div]:focus-within:shadow-[0_2px_20px_rgba(0,0,0,0.07)] [&>div]:focus-within:border-slate-300'

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
    <PromptInput onSubmit={onSubmit} className={COMPOSER_CLASSES}>
      <PromptInputTextarea
        placeholder="Ask anything"
        className="min-h-[56px] resize-none border-0 bg-transparent px-5 pt-4 pb-1 text-[15px] leading-6 shadow-none focus-visible:ring-0"
      />
      <PromptInputFooter className="px-2.5 pb-2.5">
        <PromptInputTools />
        <PromptInputSubmit
          status={status}
          onStop={onStop}
          className="size-9 rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
        >
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
  const { messages, sendMessage, status, stop } = useAgentChat({ agent })

  const busy = status === 'submitted' || status === 'streaming'
  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])

  function handleSubmit(message: PromptInputMessage) {
    const text = message.text.trim()
    if (!text) return
    void sendMessage({ text })
  }

  const isEmpty = messages.length === 0

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {isEmpty ? (
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="flex w-full max-w-3xl -translate-y-8 flex-col items-center gap-7">
            <h1 className="text-[30px] font-semibold tracking-tight text-slate-900">
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
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={
                    m.role === 'user' ? 'flex justify-end' : 'flex justify-start'
                  }
                >
                  <div
                    className={
                      m.role === 'user'
                        ? 'max-w-[80%] rounded-3xl bg-slate-100 px-4 py-2.5 text-[15px] text-slate-900'
                        : 'max-w-[80%] text-[15px] leading-7 text-slate-800'
                    }
                  >
                    <MessageResponse>{partsToText(m.parts)}</MessageResponse>
                  </div>
                </div>
              ))}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          <div className="mx-auto w-full max-w-3xl px-4 pb-4">
            <Composer onSubmit={handleSubmit} status={status} onStop={stop} />
            <p className="mt-2 text-center text-[11px] text-slate-400">
              MilesVault can make mistakes. Check important info.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

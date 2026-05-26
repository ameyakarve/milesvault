'use client'

import { useAgent } from 'agents/react'
import { useAgentChat } from '@cloudflare/ai-chat/react'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message'
import {
  PromptInput,
  PromptInputBody,
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

export function Chat() {
  const agent = useAgent({ agent: 'LedgerDO', basePath: 'api/agents' })
  const { messages, sendMessage, status, stop } = useAgentChat({ agent })

  function handleSubmit(message: PromptInputMessage) {
    const text = message.text.trim()
    if (!text) return
    void sendMessage({ text })
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <Conversation>
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {messages.length === 0 ? (
            <ConversationEmptyState
              title="How can I help?"
              description="Ask anything about your finances."
            />
          ) : (
            messages.map((m) => (
              <Message key={m.id} from={m.role}>
                <MessageContent>
                  <MessageResponse>{partsToText(m.parts)}</MessageResponse>
                </MessageContent>
              </Message>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="sticky bottom-0 z-10 mx-auto flex w-full max-w-3xl gap-2 bg-background px-2 pb-3 md:px-4 md:pb-4">
        <PromptInput onSubmit={handleSubmit} className="w-full">
          <PromptInputBody>
            <PromptInputTextarea placeholder="Message…" />
            <PromptInputFooter>
              <PromptInputTools />
              <PromptInputSubmit status={status} onStop={stop} />
            </PromptInputFooter>
          </PromptInputBody>
        </PromptInput>
      </div>
    </div>
  )
}

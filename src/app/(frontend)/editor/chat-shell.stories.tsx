import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { ArrowUp } from 'lucide-react'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input'

type Tab = 'chat' | 'journal'

function SegmentedTabs({ value, onChange }: { value: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 p-0.5">
      {(['chat', 'journal'] as const).map((t) => {
        const active = value === t
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className={[
              'rounded-full px-3.5 py-1 text-[13px] font-medium transition',
              active
                ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                : 'text-slate-600 hover:text-slate-900',
            ].join(' ')}
          >
            {t === 'chat' ? 'Chat' : 'Journal'}
          </button>
        )
      })}
    </div>
  )
}

const COMPOSER_CLASSES =
  '[&>div]:h-auto [&>div]:rounded-[28px] [&>div]:border [&>div]:border-slate-200/80 [&>div]:bg-white [&>div]:shadow-[0_2px_12px_rgba(0,0,0,0.04)] [&>div]:transition-shadow [&>div]:focus-within:shadow-[0_2px_20px_rgba(0,0,0,0.07)] [&>div]:focus-within:border-slate-300'

function Composer() {
  return (
    <PromptInput onSubmit={() => {}} className={COMPOSER_CLASSES}>
      <PromptInputTextarea
        placeholder="Ask anything"
        className="min-h-[56px] resize-none border-0 bg-transparent px-5 pt-4 pb-1 text-[15px] leading-6 shadow-none focus-visible:ring-0"
      />
      <PromptInputFooter className="px-2.5 pb-2.5">
        <PromptInputTools />
        <PromptInputSubmit
          status={undefined}
          className="size-9 rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
        >
          <ArrowUp className="size-4" strokeWidth={2.5} />
        </PromptInputSubmit>
      </PromptInputFooter>
    </PromptInput>
  )
}

function ChatShell({ messages = [] as { role: 'user' | 'assistant'; text: string }[] }) {
  const [tab, setTab] = useState<Tab>('chat')
  const isEmpty = messages.length === 0

  return (
    <div className="flex h-screen flex-col bg-[#fbfbfa]">
      <header className="flex items-center justify-center border-b border-slate-200/60 px-6 py-3">
        <SegmentedTabs value={tab} onChange={setTab} />
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {isEmpty ? (
          <div className="flex flex-1 items-center justify-center px-4">
            <div className="flex w-full max-w-3xl flex-col items-center gap-7 -translate-y-8">
              <h1 className="text-[30px] font-semibold tracking-tight text-slate-900">
                How can I help?
              </h1>
              <div className="w-full">
                <Composer />
              </div>
            </div>
          </div>
        ) : (
          <>
            <Conversation>
              <ConversationContent className="mx-auto w-full max-w-3xl py-6">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={
                      m.role === 'user'
                        ? 'flex justify-end'
                        : 'flex justify-start'
                    }
                  >
                    <div
                      className={
                        m.role === 'user'
                          ? 'max-w-[80%] rounded-3xl bg-slate-100 px-4 py-2.5 text-[15px] text-slate-900'
                          : 'max-w-[80%] text-[15px] leading-7 text-slate-800'
                      }
                    >
                      {m.text}
                    </div>
                  </div>
                ))}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>

            <div className="mx-auto w-full max-w-3xl px-4 pb-4">
              <Composer />
              <p className="mt-2 text-center text-[11px] text-slate-400">
                MilesVault can make mistakes. Check important info.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const meta: Meta<typeof ChatShell> = {
  title: 'Editor/ChatShell',
  component: ChatShell,
  parameters: { layout: 'fullscreen' },
}
export default meta

export const Empty: StoryObj<typeof ChatShell> = {}

export const WithMessages: StoryObj<typeof ChatShell> = {
  args: {
    messages: [
      { role: 'user', text: 'What was my biggest expense last month?' },
      {
        role: 'assistant',
        text: 'Your largest single expense last month was ₹42,300 on rent (Mar 1). Outside recurring bills, your biggest discretionary spend was a ₹12,800 dinner at Olive on Mar 14.',
      },
      { role: 'user', text: 'Show me the top 5 categories.' },
    ],
  },
}

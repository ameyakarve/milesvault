import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { AiPaneView, type ChatMessage } from './ai-pane-view'

const userMsg = (id: string, text: string): ChatMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text }],
})

const replyMsg = (id: string, message: string): ChatMessage => ({
  id,
  role: 'assistant',
  parts: [
    {
      type: 'tool-reply',
      toolCallId: `${id}-tc`,
      state: 'output-available',
      input: { message },
    },
  ],
})

const proposeMsg = (id: string, message: string): ChatMessage => ({
  id,
  role: 'assistant',
  parts: [
    {
      type: 'tool-propose',
      toolCallId: `${id}-tc`,
      state: 'output-available',
      input: { message },
    },
  ],
})

const SAMPLE: ChatMessage[] = [
  userMsg('u1', 'How much did I spend on coffee this month?'),
  replyMsg(
    'a1',
    'You spent ₹420 on coffee in April across 7 transactions. Blue Bottle was the largest at ₹180.',
  ),
  userMsg('u2', 'Add ₹250 at Third Wave from my HDFC Infinia today'),
  proposeMsg(
    'a2',
    'Staged a 250 INR coffee txn at Third Wave on 2026-04-25, charged to HDFC Infinia. Review and save.',
  ),
]

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen flex bg-[#F4F6F8]">
      <div className="flex-1" />
      {children}
    </div>
  )
}

function StatefulHarness({
  initialMessages,
  initialStatus = 'idle',
  initialBusy = false,
  saving = false,
  errorMessage = null,
}: {
  initialMessages: ChatMessage[]
  initialStatus?: string
  initialBusy?: boolean
  saving?: boolean
  errorMessage?: string | null
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [status, setStatus] = useState(initialStatus)
  const [busy, setBusy] = useState(initialBusy)
  return (
    <Frame>
      <AiPaneView
        messages={messages}
        status={status}
        busy={busy}
        saving={saving}
        chatLocked={busy || saving}
        errorMessage={errorMessage}
        onSubmit={(text) => {
          const id = `u${messages.length}`
          setMessages((m) => [...m, userMsg(id, text)])
          setStatus('submitted')
          setBusy(true)
          setTimeout(() => {
            setMessages((m) => [...m, replyMsg(`a${m.length}`, 'Got it.')])
            setStatus('idle')
            setBusy(false)
          }, 900)
        }}
        onClear={() => {
          setMessages([])
          setStatus('idle')
          setBusy(false)
        }}
      />
    </Frame>
  )
}

const meta: Meta<typeof StatefulHarness> = {
  title: 'LedgerNew / AiPane',
  component: StatefulHarness,
  parameters: { layout: 'fullscreen' },
}
export default meta

type Story = StoryObj<typeof StatefulHarness>

export const Empty: Story = {
  args: { initialMessages: [] },
}

export const WithMessages: Story = {
  args: { initialMessages: SAMPLE },
}

export const Thinking: Story = {
  args: {
    initialMessages: [userMsg('u1', 'Add ₹250 at Third Wave from my HDFC Infinia today')],
    initialStatus: 'submitted',
    initialBusy: true,
  },
}

export const Working: Story = {
  args: {
    initialMessages: [
      userMsg('u1', 'How much did I spend on coffee this month?'),
      replyMsg('a1', 'Searching…'),
    ],
    initialStatus: 'streaming',
    initialBusy: true,
  },
}

export const ErrorState: Story = {
  args: {
    initialMessages: SAMPLE.slice(0, 2),
    errorMessage: 'connection lost — retry in a moment',
  },
}

export const Saving: Story = {
  args: {
    initialMessages: SAMPLE,
    saving: true,
  },
}
